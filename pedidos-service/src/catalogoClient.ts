const CATALOGO_URL = process.env.CATALOGO_URL ?? "http://localhost:4000/";

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(CATALOGO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}

export interface ProductoCatalogo {
  sku: string;
  nombre: string;
  precio: number;
  stock: number | null;
}

// Devuelve el producto o null si no existe
export async function obtenerProducto(sku: string): Promise<ProductoCatalogo | null> {
  const data = await graphql<{ productoPorSku: ProductoCatalogo | null }>(
    `query ($sku: String!) {
      productoPorSku(sku: $sku) { sku nombre precio stock }
    }`,
    { sku }
  );
  return data.productoPorSku;
}

export interface ResultadoReserva {
  exito: boolean;
  mensaje: string;
  stockRestante: number;
}

export async function reservarStock(sku: string, cantidad: number): Promise<ResultadoReserva> {
  const data = await graphql<{ reservarStock: ResultadoReserva }>(
    `mutation ($sku: String!, $cantidad: Int!) {
      reservarStock(sku: $sku, cantidad: $cantidad) { exito mensaje stockRestante }
    }`,
    { sku, cantidad }
  );
  return data.reservarStock;
}
export async function liberarStock(sku: string, cantidad: number): Promise<ResultadoReserva> {
  const data = await graphql<{ liberarStock: ResultadoReserva }>(
    `mutation ($sku: String!, $cantidad: Int!) {
      liberarStock(sku: $sku, cantidad: $cantidad) { exito mensaje stockRestante }
    }`,
    { sku, cantidad }
  );
  return data.liberarStock;
}