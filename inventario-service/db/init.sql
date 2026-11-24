CREATE TABLE IF NOT EXISTS stock (
  sku VARCHAR(50) PRIMARY KEY,
  cantidad INT NOT NULL DEFAULT 0
);

INSERT INTO stock (sku, cantidad) VALUES
  ('LAP-001', 10),
  ('MOU-001', 50),
  ('TEC-001', 25);