import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  featureBullets,
  featureEmoji,
  isBlockedPage,
  parseAmazonPrice,
  parseProductPage,
  withFeatureBullets,
} from '../../server/domain/amazon-page'
import { ProviderUnavailableError, type ProductProvider } from '../../server/providers/types'
import { ProductLookupError, lookupProduct } from '../../server/services/product-lookup'

/** Fragmentos con el marcado de una ficha real de amazon.es. */
function page(opts: { strikeLabel?: string; price?: string; strike?: string } = {}) {
  const { strikeLabel = 'Precio recomendado:', price = '29,99€', strike = '39,99€' } = opts
  return `<html><body>
<span id="productTitle" class="a-size-large product-title-word-break">        Auriculares Bluetooth &amp; inalámbricos   </span>
<a id="bylineInfo" class="a-link-normal" href="/stores/X">Visita la tienda de Sonix</a>
<div id="corePriceDisplay_desktop_feature_div">
  <div class="a-section a-spacing-none aok-align-center aok-relative">
    <span class="a-price aok-align-center reinventPricePriceToPayMargin priceToPay" data-a-size="xl"><span class="a-offscreen">${price}</span><span aria-hidden="true"><span class="a-price-whole">29<span class="a-price-decimal">,</span></span><span class="a-price-fraction">99</span></span></span>
  </div>
  <div class="a-section a-spacing-small aok-align-center">
    <span class="a-size-small a-color-secondary aok-align-center basisPrice">${strikeLabel}
      <span class="a-price a-text-price" data-a-size="s" data-a-strike="true" data-a-color="secondary"><span class="a-offscreen">${strike}</span><span aria-hidden="true">${strike}</span></span>
    </span>
  </div>
</div>
<div id="feature-bullets" class="a-section a-spacing-medium a-spacing-top-small">
  <ul class="a-unordered-list a-vertical a-spacing-mini">
    <li class="a-spacing-mini"><span class="a-list-item"> BATERÍA DE LARGA DURACIÓN: hasta 30 horas de autonomía con el estuche de carga. </span></li>
    <li class="a-spacing-mini"><span class="a-list-item"> Cancelación activa de ruido para escuchar sin distracciones. </span></li>
    <li class="aok-hidden"><span class="a-list-item">oculto</span></li>
    <li class="a-spacing-mini"><span class="a-list-item"> Diseño ergonómico y ligero.&nbsp; </span></li>
  </ul>
</div>
<ul><li>Otra lista que no cuenta</li></ul>
</body></html>`
}

describe('parseProductPage', () => {
  it('lee título, marca, precio, PVP recomendado y características', () => {
    expect(parseProductPage(page())).toEqual({
      title: 'Auriculares Bluetooth & inalámbricos',
      brand: 'Sonix',
      priceCents: 2999,
      basisPriceCents: 3999,
      basisType: 'LIST_PRICE',
      features: [
        'BATERÍA DE LARGA DURACIÓN: hasta 30 horas de autonomía con el estuche de carga.',
        'Cancelación activa de ruido para escuchar sin distracciones.',
        'Diseño ergonómico y ligero.',
      ],
    })
  })

  it('el precio tachado sin «recomendado» es un precio anterior', () => {
    const data = parseProductPage(page({ strikeLabel: 'Precio anterior:' }))
    expect(data.basisType).toBe('WAS_PRICE')
  })

  it('descarta un precio de referencia que no es mayor que el precio', () => {
    const data = parseProductPage(page({ strike: '19,99€' }))
    expect(data).toMatchObject({ priceCents: 2999, basisPriceCents: null, basisType: null })
  })

  it('sin bloque de precio, usa priceAmount de los datos de la página', () => {
    const html = `<span id="productTitle">Cuna</span><script>{"priceAmount":1234.5,"currencySymbol":"€"}</script>`
    expect(parseProductPage(html)).toMatchObject({ title: 'Cuna', priceCents: 123450, features: [] })
  })
})

/** Price block of real amazon.es product pages, trimmed (tests/fixtures/amazon-page). */
function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/amazon-page/${name}.html`, import.meta.url), 'utf8')
}

describe('parseProductPage with real amazon.es pages', () => {
  it('reads a deal with «Precio recomendado» (empty a-offscreen in the price to pay)', () => {
    expect(parseProductPage(fixture('list-price'))).toMatchObject({
      title: 'Auriculares de diadema de prueba',
      priceCents: 2299,
      basisPriceCents: 2599,
      basisType: 'LIST_PRICE',
    })
  })

  it('with «Precio recomendado» and «El precio más bajo de los últimos 30 días», takes the first one (the discount reference)', () => {
    expect(parseProductPage(fixture('list-price-and-lowest-30-days'))).toMatchObject({
      priceCents: 2346,
      basisPriceCents: 4999,
      basisType: 'LIST_PRICE',
    })
  })

  it('when the first struck-through price is not higher, takes the 30-day lowest price as WAS_PRICE', () => {
    const html = fixture('list-price-and-lowest-30-days').replaceAll('49,99', '19,99')
    expect(parseProductPage(html)).toMatchObject({ priceCents: 2346, basisPriceCents: 2469, basisType: 'WAS_PRICE' })
  })

  it('«Precio más bajo reciente» is a WAS_PRICE', () => {
    const html = fixture('list-price').replaceAll('Precio recomendado:', 'Precio más bajo reciente:')
    expect(parseProductPage(html)).toMatchObject({ priceCents: 2299, basisPriceCents: 2599, basisType: 'WAS_PRICE' })
  })

  it('without a struck-through price, reads only the price', () => {
    expect(parseProductPage(fixture('no-basis'))).toMatchObject({
      priceCents: 2498,
      basisPriceCents: null,
      basisType: null,
    })
  })

  it('reads a price with a thousands separator', () => {
    const html = fixture('no-basis').replace('<span class="a-price-whole">24<', '<span class="a-price-whole">1.299<')
    expect(parseProductPage(html).priceCents).toBe(129998)
  })

  it('product without an available offer: no price', () => {
    expect(parseProductPage(fixture('unavailable'))).toMatchObject({
      title: 'Auriculares agotados de prueba',
      priceCents: null,
      basisPriceCents: null,
    })
  })

  it('without the price-to-pay element, uses the accessibility text of the price block', () => {
    const html = fixture('list-price').replace(/<span class="a-price aok-align-center[^"]*priceToPay[\s\S]*?<\/span><\/span><\/span>/, '')
    expect(html).not.toContain('priceToPay apex-pricetopay-value')
    expect(parseProductPage(html)).toMatchObject({ priceCents: 2299, basisPriceCents: 2599 })
  })

  it('in buying options data, uses the new offer price, not the used one', () => {
    const html = `<span id="productTitle">Auriculares</span><div class="twister-plus-buying-options-price-data">{"desktop_buybox_group_1":[{"priceAmount":13.77,"buyingOptionType":"USED"},{"priceAmount":22.99,"buyingOptionType":"NEW"}]}</div>`
    expect(parseProductPage(html).priceCents).toBe(2299)
  })

  it.each([
    ['P.V.P.:', 'LIST_PRICE'],
    ['Precio anterior:', 'WAS_PRICE'],
    ['', 'LIST_PRICE'],
  ])('classifies the reference label %j as %s (unknown labels are not a previous price)', (label, type) => {
    const html = fixture('list-price').replaceAll('Precio recomendado:', label)
    expect(parseProductPage(html)).toMatchObject({ basisPriceCents: 2599, basisType: type })
  })

  it('reads the label from a sibling element before the struck-through price', () => {
    const html = `<span id="productTitle">Auriculares</span><div id="corePriceDisplay_desktop_feature_div"><span class="a-price priceToPay"><span class="a-offscreen">29,99€</span></span><div>Precio recomendado:</div><div><span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">49,99€</span></span></div></div>`
    expect(parseProductPage(html)).toMatchObject({ priceCents: 2999, basisPriceCents: 4999, basisType: 'LIST_PRICE' })
  })

  it('never takes the price of a used offer', () => {
    const html = `<span id="productTitle">Auriculares</span><div class="twister-plus-buying-options-price-data">{"desktop_buybox_group_1":[{"priceAmount":13.77,"buyingOptionType":"USED"}]}</div>`
    expect(parseProductPage(html).priceCents).toBeNull()
  })

  it('does not read the struck-through price when the price-to-pay element has no offscreen text', () => {
    const html = fixture('list-price').replace('<span class="a-offscreen"> </span><span aria-hidden="true"><span class="a-price-whole">', '<span aria-hidden="true"><span class="a-price-whole">')
    expect(parseProductPage(html)).toMatchObject({ priceCents: 2299, basisPriceCents: 2599 })
  })
})

describe('parseAmazonPrice', () => {
  it.each([
    ['19,99€', 1999],
    ['1.299,99 €', 129999],
    ['20 €', 2000],
    ['19.99', 1999],
    ['gratis', null],
  ])('%s → %s', (input, cents) => expect(parseAmazonPrice(input)).toBe(cents))
})

describe('isBlockedPage', () => {
  it('detecta captchas y páginas sin ficha', () => {
    expect(isBlockedPage('<form action="/errors/validateCaptcha">')).toBe(true)
    expect(isBlockedPage('<title>Documento no encontrado</title>')).toBe(true)
    expect(isBlockedPage(page())).toBe(false)
  })
})

describe('viñetas de características', () => {
  it('pone un emoji según el tema y recorta sin reescribir', () => {
    expect(featureEmoji('Batería de 5000 mAh')).toBe('🔋')
    expect(featureEmoji('Conexión Bluetooth 5.3')).toBe('📶')
    expect(featureEmoji('Algo sin pistas')).toBe('✅')
    const long = `Texto ${'muy '.repeat(40)}largo`
    const [line] = featureBullets([long]).split('\n')
    expect(line!.length).toBeLessThanOrEqual(113)
    expect(line!.endsWith('…')).toBe(true)
  })

  it('usa como mucho 5 características', () => {
    expect(featureBullets(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']).split('\n')).toHaveLength(5)
  })

  it('añade las viñetas tras el comentario sin duplicarlas', () => {
    const once = withFeatureBullets('Me encanta', ['Batería de 30 h'])
    expect(once).toBe('Me encanta\n\n🔋 Batería de 30 h')
    expect(withFeatureBullets(once, ['Batería de 30 h'])).toBe(once)
    expect(withFeatureBullets('', [])).toBe('')
  })
})

describe('lookupProduct', () => {
  const unavailableApi: ProductProvider = {
    id: 'creators_api',
    capabilities: { prices: true },
    search: () => Promise.reject(new ProviderUnavailableError('creators_api', 'sin credenciales')),
    refresh: () => Promise.reject(new ProviderUnavailableError('creators_api', 'sin credenciales')),
  }

  it('sin API, lee la ficha de amazon.es', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(page(), { status: 200 }))
    const result = await lookupProduct('B08N5WRWNW', { fetchFn, api: unavailableApi })
    expect(fetchFn.mock.calls[0]![0]).toBe('https://www.amazon.es/dp/B08N5WRWNW')
    expect(result).toMatchObject({ source: 'amazon_page', priceCents: 2999, brand: 'Sonix' })
  })

  it('con API, no abre la página', async () => {
    const fetchFn = vi.fn()
    const api: ProductProvider = {
      ...unavailableApi,
      refresh: async () => [
        {
          asin: 'B08N5WRWNW',
          source: 'creators_api',
          capturedAt: 0,
          title: 'Echo',
          brand: 'Amazon',
          detailPageUrl: 'u',
          imageUrl: null,
          features: ['Altavoz inteligente'],
          offer: {
            priceCents: 2999,
            currency: 'EUR',
            savingBasisCents: 5999,
            savingBasisType: 'LIST_PRICE',
            savingsPercent: 50,
            availability: null,
            condition: 'New',
            isBuyBoxWinner: true,
            dealType: null,
            dealBadge: null,
            dealEndsAt: null,
            violatesMap: false,
          },
        },
      ],
    }
    const result = await lookupProduct('B08N5WRWNW', { fetchFn, api })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      source: 'creators_api',
      priceCents: 2999,
      basisPriceCents: 5999,
      basisType: 'LIST_PRICE',
      features: ['Altavoz inteligente'],
    })
  })

  it('avisa si Amazon bloquea la consulta', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<title>Documento no encontrado</title>', { status: 404 }))
    await expect(lookupProduct('B08N5WRWNW', { fetchFn, api: unavailableApi })).rejects.toBeInstanceOf(
      ProductLookupError,
    )
  })
})
