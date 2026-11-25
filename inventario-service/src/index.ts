import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import mysql from "mysql2/promise";

const PROTO_PATH = process.env.PROTO_PATH ?? path.join(__dirname, "../../proto/inventario.proto");

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3307),
  user: "root",
  password: process.env.DB_PASSWORD ?? "root",
  database: "inventario",
});

const definition = protoLoader.loadSync(PROTO_PATH, { keepCase: true });
const proto: any = grpc.loadPackageDefinition(definition).inventario;

async function consultarStock(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  try {
    const { producto_id } = call.request;
    const [rows]: any = await pool.query(
      "SELECT cantidad FROM stock WHERE sku = ?",
      [producto_id]
    );
    if (rows.length === 0) {
      return callback({ code: grpc.status.NOT_FOUND, message: "Producto no encontrado" });
    }
    callback(null, { producto_id, cantidad: rows[0].cantidad });
  } catch (err) {
    console.error(err);
    callback({ code: grpc.status.INTERNAL, message: "Error interno" });
  }
}

async function reservarStock(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  try {
    const { producto_id, cantidad } = call.request;
    if (cantidad <= 0) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: "La cantidad debe ser mayor a 0" });
    }

    // Un solo UPDATE condicionado: descuenta solo si alcanza el stock
    const [result]: any = await pool.query(
      "UPDATE stock SET cantidad = cantidad - ? WHERE sku = ? AND cantidad >= ?",
      [cantidad, producto_id, cantidad]
    );

    if (result.affectedRows === 0) {
      return callback(null, {
        exito: false,
        mensaje: "Stock insuficiente o producto inexistente",
        stock_restante: 0,
      });
    }

    const [rows]: any = await pool.query(
      "SELECT cantidad FROM stock WHERE sku = ?",
      [producto_id]
    );
    callback(null, { exito: true, mensaje: "Reserva exitosa", stock_restante: rows[0].cantidad });
  } catch (err) {
    console.error(err);
    callback({ code: grpc.status.INTERNAL, message: "Error interno" });
  }
}

async function liberarStock(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  try {
    const { producto_id, cantidad } = call.request;
    if (cantidad <= 0) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: "La cantidad debe ser mayor a 0" });
    }
    const [result]: any = await pool.query(
      "UPDATE stock SET cantidad = cantidad + ? WHERE sku = ?",
      [cantidad, producto_id]
    );
    if (result.affectedRows === 0) {
      return callback(null, { exito: false, mensaje: "Producto inexistente", stock_restante: 0 });
    }
    const [rows]: any = await pool.query("SELECT cantidad FROM stock WHERE sku = ?", [producto_id]);
    callback(null, { exito: true, mensaje: "Stock liberado", stock_restante: rows[0].cantidad });
  } catch (err) {
    console.error(err);
    callback({ code: grpc.status.INTERNAL, message: "Error interno" });
  }
}

const server = new grpc.Server();

server.addService(proto.Inventario.service, { consultarStock, reservarStock, liberarStock });

const PORT = process.env.PORT ?? "50051";
server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log(`Inventario gRPC escuchando en el puerto ${PORT}`);
});