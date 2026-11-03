-- A small shop, written by hand for the importer tests (Postgres flavour).
SET statement_timeout = 0;

CREATE TABLE IF NOT EXISTS "public"."customers" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email character varying(255) NOT NULL UNIQUE,
  name text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.orders (
  id integer GENERATED ALWAYS AS IDENTITY,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  total numeric(10, 2) NOT NULL CHECK (total >= 0),
  status text DEFAULT 'new; not paid', -- a ';' inside a string
  CONSTRAINT orders_pkey PRIMARY KEY (id)
);

CREATE TABLE order_lines (
  order_id integer NOT NULL,
  product_sku text NOT NULL,
  quantity integer DEFAULT 1,
  PRIMARY KEY (order_id, product_sku),
  FOREIGN KEY (order_id) REFERENCES orders (id)
);

CREATE TABLE invoices (
  id serial PRIMARY KEY,
  order_id integer NOT NULL,
  vendor_id integer REFERENCES vendors
);

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_order_key UNIQUE (order_id);
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_order_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);

CREATE INDEX orders_customer_idx ON orders (customer_id);
CREATE INDEX orders_status_idx ON orders (status);
CREATE VIEW big_orders AS SELECT * FROM orders WHERE total > 100;
