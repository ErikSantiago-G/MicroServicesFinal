import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PROTO_PATH = process.env.PROTO_PATH ?? path.join(__dirname, "../../proto/inventario.proto");
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? "localhost:50051";

const definition = protoLoader.loadSync(PROTO_PATH, { keepCase: true });
const proto: any = grpc.loadPackageDefinition(definition).inventario;

const client = new proto.Inventario(
  INVENTARIO_URL,
  grpc.credentials.createInsecure()
);

export interface ResultadoReserva {
  exito: boolean;
  mensaje: string;
  stock_restante: number;
}

// Devuelve el stock, o null si el producto no existe en inventario
export function consultarStock(sku: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    client.consultarStock({ producto_id: sku }, (err: any, res: any) => {
      if (err) {
        if (err.code === grpc.status.NOT_FOUND) return resolve(null);
        return reject(err);
      }
      resolve(res.cantidad);
    });
  });
}

export function reservarStock(sku: string, cantidad: number): Promise<ResultadoReserva> {
  return new Promise((resolve, reject) => {
    client.reservarStock({ producto_id: sku, cantidad }, (err: any, res: any) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}
export function liberarStock(sku: string, cantidad: number): Promise<ResultadoReserva> {
  return new Promise((resolve, reject) => {
    client.liberarStock({ producto_id: sku, cantidad }, (err: any, res: any) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}