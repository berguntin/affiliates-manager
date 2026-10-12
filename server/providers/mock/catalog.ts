/** Catálogo ficticio para desarrollo y tests. ASIN inventados (prefijo B0MOCK). */
export interface MockProduct {
  asin: string
  title: string
  brand: string
  /** Search index de amazon.es al que pertenece. */
  searchIndex: string
  basePriceCents: number
}

const p = (n: number, title: string, brand: string, searchIndex: string, euros: number): MockProduct => ({
  asin: `B0MOCK${String(n).padStart(4, '0')}`,
  title,
  brand,
  searchIndex,
  basePriceCents: Math.round(euros * 100),
})

export const MOCK_CATALOG: MockProduct[] = [
  p(1, 'Pañales talla 3 (6-10 kg), pack mensual de 204 unidades', 'Dodot', 'Baby', 52.99),
  p(2, 'Toallitas para bebé sin perfume, 12 paquetes de 64 unidades', 'Mustela', 'Baby', 18.49),
  p(3, 'Cochecito de bebé plegable ultraligero con capota', 'Chicco', 'Baby', 229),
  p(4, 'Silla de coche giratoria 360° i-Size grupo 0+/1', 'Joie', 'Baby', 289.9),
  p(5, 'Vigilabebés con cámara y visión nocturna', 'Philips Avent', 'Baby', 139.99),
  p(6, 'Esterilizador eléctrico de biberones a vapor', 'Philips Avent', 'Baby', 74.99),
  p(7, 'Biberones anticólicos 260 ml, pack de 4', 'MAM', 'Baby', 27.5),
  p(8, 'Hamaca para bebé con vibración y melodías', 'Fisher-Price', 'Baby', 89.99),
  p(9, 'Cuna de viaje plegable con colchón', 'Chicco', 'Baby', 119),
  p(10, 'Mochila portabebés ergonómica 4 posiciones', 'Ergobaby', 'Baby', 159),
  p(11, 'Termómetro infrarrojo sin contacto para bebé', 'Braun', 'HealthPersonalCare', 49.99),
  p(12, 'Gimnasio de actividades para bebé con arco musical', 'Fisher-Price', 'ToysAndGames', 54.99),
  p(13, 'Pañales talla 4 (9-14 kg), pack mensual de 174 unidades', 'Huggies', 'Baby', 49.99),
  p(14, 'Crema para el culito del bebé, 2 x 100 ml', 'Mustela', 'Baby', 14.99),
  p(15, 'Trona evolutiva de madera regulable', 'Stokke', 'Baby', 249),
  p(16, 'Mando inalámbrico para consola, edición negra', 'Sony', 'VideoGames', 69.99),
  p(17, 'Auriculares gaming con micrófono y sonido envolvente', 'Logitech', 'VideoGames', 89.99),
  p(18, 'Tarjeta microSD 512 GB para consola portátil', 'SanDisk', 'Electronics', 59.99),
  p(19, 'Teclado mecánico gaming RGB switches rojos', 'Corsair', 'Computers', 119.99),
  p(20, 'Ratón gaming inalámbrico 25.000 DPI', 'Razer', 'Computers', 99.99),
  p(21, 'Robot aspirador con mapeo láser y base de vaciado', 'Roborock', 'HomeAndKitchen', 399),
  p(22, 'Freidora de aire 5,5 l digital', 'Cosori', 'HomeAndKitchen', 119.99),
  p(23, 'Cafetera superautomática con espumador de leche', "De'Longhi", 'HomeAndKitchen', 449),
  p(24, 'Juego de sartenes antiadherentes inducción, 3 piezas', 'Tefal', 'HomeAndKitchen', 59.99),
  p(25, 'Purificador de aire con filtro HEPA', 'Levoit', 'HomeAndKitchen', 129.99),
  p(26, 'Bombillas inteligentes Wi-Fi, pack de 4', 'Philips Hue', 'HomeAndKitchen', 79.99),
  p(27, 'Cepillo de dientes eléctrico sónico', 'Oral-B', 'HealthPersonalCare', 89.99),
  p(28, 'Mochila escolar ergonómica infantil', 'Totto', 'Fashion', 44.99),
  p(29, 'Bloques de construcción 1.000 piezas', 'LEGO', 'ToysAndGames', 99.99),
  p(30, 'Pañales talla 3 (6-10 kg) reacondicionado embalaje dañado', 'Dodot', 'Baby', 39.99),
]
