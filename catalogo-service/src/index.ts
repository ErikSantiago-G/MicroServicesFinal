import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { MongoClient, ObjectId } from "mongodb";
import { consultarStock, reservarStock } from "./inventarioClient";


const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27018";
const PORT = Number(process.env.PORT ?? 4000);

const typeDefs = `#graphql
  type Producto {
    id: ID!
    sku: String!
    nombre: String!
    descripcion: String
    precio: Float!
    stock: Int
  }

  type ResultadoReserva {
    exito: Boolean!
    mensaje: String!
    stockRestante: Int!
  }

  input ProductoInput {
    sku: String!
    nombre: String!
    descripcion: String
    precio: Float!
  }

  type Query {
    productos: [Producto!]!
    producto(id: ID!): Producto
    productoPorSku(sku: String!): Producto
  }

  type Mutation {
    crearProducto(input: ProductoInput!): Producto!
    reservarStock(sku: String!, cantidad: Int!): ResultadoReserva!
  }
`;

async function main() {
  const mongo = new MongoClient(MONGO_URL);
  await mongo.connect();
  const productos = mongo.db("catalogo").collection("productos");

  // El SKU es único: es el identificador que compartimos con inventario
  await productos.createIndex({ sku: 1 }, { unique: true });

  // Datos de ejemplo (solo si la colección está vacía)
  if ((await productos.countDocuments()) === 0) {
    await productos.insertMany([
      { sku: "LAP-001", nombre: "Laptop Pro 14", descripcion: "Portátil de 14 pulgadas", precio: 3200000 },
      { sku: "MOU-001", nombre: "Mouse inalámbrico", descripcion: "Mouse ergonómico", precio: 85000 },
      { sku: "TEC-001", nombre: "Teclado mecánico", descripcion: "Teclado con switches rojos", precio: 250000 },
    ]);
    console.log("Productos de ejemplo insertados");
  }

  // Convierte el documento de Mongo (_id) al tipo GraphQL (id)
  const toProducto = (doc: any) => ({
    id: doc._id.toString(),
    sku: doc.sku,
    nombre: doc.nombre,
    descripcion: doc.descripcion ?? null,
    precio: doc.precio,
  });

  const resolvers = {
    Producto: {
      // Solo se ejecuta si el cliente pide el campo "stock"
      stock: async (producto: { sku: string }) => {
        try {
          return await consultarStock(producto.sku);
        } catch (err) {
          console.error("Error consultando inventario:", err);
          return null;
        }
      },
    },
    Query: {
      productos: async () => (await productos.find().toArray()).map(toProducto),
      producto: async (_: unknown, { id }: { id: string }) => {
        if (!ObjectId.isValid(id)) return null;
        const doc = await productos.findOne({ _id: new ObjectId(id) });
        return doc ? toProducto(doc) : null;
      },
      productoPorSku: async (_: unknown, { sku }: { sku: string }) => {
        const doc = await productos.findOne({ sku });
        return doc ? toProducto(doc) : null;
      },
    },
    Mutation: {
      crearProducto: async (_: unknown, { input }: { input: any }) => {
        const doc = { ...input };
        const result = await productos.insertOne(doc);
        return toProducto({ _id: result.insertedId, ...doc });
      },
      reservarStock: async (
        _: unknown,
        { sku, cantidad }: { sku: string; cantidad: number }
      ) => {
        const res = await reservarStock(sku, cantidad);
        return {
          exito: res.exito,
          mensaje: res.mensaje,
          stockRestante: res.stock_restante,
        };
      },
    },
  };

  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, { listen: { port: PORT } });
  console.log(`Catálogo GraphQL listo en ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});