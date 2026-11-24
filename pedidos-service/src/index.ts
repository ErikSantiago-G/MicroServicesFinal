import express from "express";
import { Pool } from "pg";

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
  nombre: string;
  precio: number;
  cantidad: number;
}

// POST /orders: crear un pedido
app.post("/orders", async (req, res) => {
  const { cliente, items } = req.body as { cliente?: string; items?: ItemEntrada[] };

  if (!cliente || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Se requiere 'cliente' e 'items' (al menos uno)" });
  }
  for (const it of items) {
    if (!it.sku || !it.nombre || !(it.precio > 0) || !Number.isInteger(it.cantidad) || it.cantidad <= 0) {
      return res.status(400).json({ error: "Cada item requiere sku, nombre, precio > 0 y cantidad entera > 0" });
    }
  }

  const total = items.reduce((acc, it) => acc + it.precio * it.cantidad, 0);

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const pedido = await db.query(
      "INSERT INTO pedidos (cliente, total) VALUES ($1, $2) RETURNING id, cliente, total, estado, creado_en",
      [cliente, total]
    );
    const pedidoId = pedido.rows[0].id;

    for (const it of items) {
      await db.query(
        "INSERT INTO pedido_items (pedido_id, sku, nombre, precio, cantidad) VALUES ($1, $2, $3, $4, $5)",
        [pedidoId, it.sku, it.nombre, it.precio, it.cantidad]
      );
    }
    await db.query("COMMIT");
    res.status(201).json({ ...pedido.rows[0], items });
  } catch (err) {
    await db.query("ROLLBACK");
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
      "SELECT id, cliente, total, estado, creado_en FROM pedidos ORDER BY id DESC"
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
      [id]
    );
    if (pedido.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    const items = await pool.query(
      "SELECT sku, nombre, precio, cantidad FROM pedido_items WHERE pedido_id = $1",
      [id]
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