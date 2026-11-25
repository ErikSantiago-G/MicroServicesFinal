import express from "express";
import { Pool } from "pg";
import { obtenerProducto, reservarStock, liberarStock } from "./catalogoClient";

const PORT = Number(process.env.PORT ?? 3000);

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5433),
  user: "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  database: "pedidos",
});

const app = express();
app.use(express.json());

interface ItemEntrada {
  sku: string;
  cantidad: number;
}

interface ItemPedido extends ItemEntrada {
  nombre: string;
  precio: number;
}

// Compensación: si algo falla, devolvemos el stock ya reservado
async function liberarReservas(items: ItemPedido[]) {
  for (const it of items) {
    try {
      await liberarStock(it.sku, it.cantidad);
    } catch (err) {
      console.error(`No se pudo liberar ${it.sku}`, err);
    }
  }
}

// POST /orders: crear un pedido (precio y stock vienen de B)
app.post("/orders", async (req, res) => {
  const { cliente, items } = req.body as {
    cliente?: string;
    items?: ItemEntrada[];
  };

  if (!cliente || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Se requiere 'cliente' e 'items' (al menos uno)" });
  }
  for (const it of items) {
    if (!it.sku || !Number.isInteger(it.cantidad) || it.cantidad <= 0) {
      return res
        .status(400)
        .json({ error: "Cada item requiere sku y cantidad entera > 0" });
    }
  }

  // 1) Consultar a B (GraphQL) los datos reales de cada producto
  const itemsCompletos: ItemPedido[] = [];
  try {
    for (const it of items) {
      const producto = await obtenerProducto(it.sku);
      if (!producto) {
        return res
          .status(404)
          .json({ error: `Producto ${it.sku} no existe en el catálogo` });
      }
      itemsCompletos.push({
        sku: it.sku,
        cantidad: it.cantidad,
        nombre: producto.nombre,
        precio: producto.precio,
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "No se pudo consultar el catálogo" });
  }

  // 2) Reservar stock en B (que delega a C por gRPC)
  const reservados: ItemPedido[] = [];
  try {
    for (const it of itemsCompletos) {
      const r = await reservarStock(it.sku, it.cantidad);
      if (!r.exito) {
        await liberarReservas(reservados);
        return res
          .status(409)
          .json({ error: `Sin stock para ${it.sku}: ${r.mensaje}` });
      }
      reservados.push(it);
    }
  } catch (err) {
    console.error(err);
    await liberarReservas(reservados);
    return res.status(502).json({ error: "No se pudo reservar el stock" });
  }

  // 3) Guardar el pedido en la BD de A
  const total = itemsCompletos.reduce(
    (acc, it) => acc + it.precio * it.cantidad,
    0,
  );

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const pedido = await db.query(
      "INSERT INTO pedidos (cliente, total) VALUES ($1, $2) RETURNING id, cliente, total, estado, creado_en",
      [cliente, total],
    );
    const pedidoId = pedido.rows[0].id;

    for (const it of itemsCompletos) {
      await db.query(
        "INSERT INTO pedido_items (pedido_id, sku, nombre, precio, cantidad) VALUES ($1, $2, $3, $4, $5)",
        [pedidoId, it.sku, it.nombre, it.precio, it.cantidad],
      );
    }
    await db.query("COMMIT");
    res.status(201).json({ ...pedido.rows[0], items: itemsCompletos });
  } catch (err) {
    await db.query("ROLLBACK");
    await liberarReservas(reservados);
    console.error(err);
    res.status(500).json({ error: "No se pudo crear el pedido" });
  } finally {
    db.release();
  }
});

// GET /orders: listar pedidos
app.get("/orders", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, cliente, total, estado, creado_en FROM pedidos ORDER BY id DESC",
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando pedidos" });
  }
});

// GET /orders/:id: un pedido con sus items
app.get("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "El id debe ser un número entero" });
  }
  try {
    const pedido = await pool.query(
      "SELECT id, cliente, total, estado, creado_en FROM pedidos WHERE id = $1",
      [id],
    );
    if (pedido.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    const items = await pool.query(
      "SELECT sku, nombre, precio, cantidad FROM pedido_items WHERE pedido_id = $1",
      [id],
    );
    res.json({ ...pedido.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando el pedido" });
  }
});

app.listen(PORT, () => {
  console.log(`Pedidos REST escuchando en http://localhost:${PORT}`);
});
