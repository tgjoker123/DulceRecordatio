-- =============================================================
-- Produtos e cupons de exemplo. Só entram se a tabela estiver
-- vazia (o setup:db checa antes de rodar isto).
-- =============================================================

INSERT INTO produtos (nome, cat, preco, estoque, desc_curta, img, destaque) VALUES
  ('Agenda Afetiva 2026', 'encadernacao', 59.90, 15, 'Capa dura personalizada com acabamento fosco e miolo datado.', 'https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600', TRUE),
  ('Planner Semanal Luxo', 'encadernacao', 42.00, 10, 'Organizador semanal não datado, com visão limpa da semana.', 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?q=80&w=600', FALSE),
  ('Quadro Recordações Especial', 'decoracao', 45.00, 8, 'Moldura em madeira com vidro, pronta para receber sua foto.', 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=600', TRUE);

INSERT INTO cupons (code, discount, min_subtotal) VALUES
  ('DULCE10', 10, 0),
  ('BEMVINDO', 15, 80);
