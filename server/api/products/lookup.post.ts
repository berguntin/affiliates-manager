import { productLookupInputSchema } from '../../../shared/schemas'
import { featureBullets } from '../../domain/amazon-page'
import { resolveAsinInput } from '../../services/intake'
import { ProductLookupError, lookupProduct } from '../../services/product-lookup'

/** Alta manual: precio, título, marca y características a partir del enlace o ASIN. */
export default defineEventHandler(async (event) => {
  const input = await readValidated(event, productLookupInputSchema)
  const asin = await resolveAsinInput(input.asinOrUrl)
  if (!asin) {
    throw createError({
      statusCode: 400,
      message: 'No se reconoce el producto: pega un ASIN, una URL de amazon.es o un enlace compartido desde la app de Amazon',
    })
  }
  try {
    const product = await lookupProduct(asin)
    return { ...product, bullets: featureBullets(product.features) }
  } catch (error) {
    if (error instanceof ProductLookupError) throw createError({ statusCode: 502, message: error.message })
    throw error
  }
})
