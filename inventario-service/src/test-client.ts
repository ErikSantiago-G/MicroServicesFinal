import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const definition = protoLoader.loadSync(
  path.join(__dirname, "../../proto/inventario.proto"),
  { keepCase: true }
);
const proto: any = grpc.loadPackageDefinition(definition).inventario;
const client = new proto.Inventario("localhost:50051", grpc.credentials.createInsecure());

client.consultarStock({ producto_id: "LAP-001" }, (err: any, res: any) => {
  console.log("Consulta:", err ? err.message : res);

  client.reservarStock({ producto_id: "LAP-001", cantidad: 2 }, (err: any, res: any) => {
    console.log("Reserva:", err ? err.message : res);

    client.reservarStock({ producto_id: "LAP-001", cantidad: 999 }, (err: any, res: any) => {
      console.log("Reserva excesiva:", err ? err.message : res);
    });
  });
});