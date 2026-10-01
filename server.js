const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const supabase = require('./config/supabase');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Obtener lista de pedidos con su total calculado
app.get('/api/pedidos', async (req, res) => {
  try {
    const { data: pedidos, error: errPedidos } = await supabase
      .from('col_pedidos')
      .select('*')
      .order('id', { ascending: false });

    if (errPedidos) throw errPedidos;

    const { data: detalles, error: errDetalles } = await supabase
      .from('col_detalle_pedidos')
      .select('codigo_pedido, cantidad, precio');

    if (errDetalles) throw errDetalles;

    // Calcular total por cada código_pedido
    const mapaTotales = {};
    detalles.forEach(d => {
      const subtotal = (Number(d.cantidad) || 0) * (Number(d.precio) || 0);
      mapaTotales[d.codigo_pedido] = (mapaTotales[d.codigo_pedido] || 0) + subtotal;
    });

    const pedidosConTotal = pedidos.map(p => ({
      ...p,
      total_pedido: mapaTotales[p.codigo_pedido] || 0
    }));

    res.json(pedidosConTotal);
  } catch (error) {
    console.error('Error al obtener pedidos:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Actualizar Gestión Completa
app.patch('/api/pedidos/:id/gestion', async (req, res) => {
  const { id } = req.params;
  const { estado, comentarios_empresa, factura } = req.body;

  try {
    const { data, error } = await supabase
      .from('col_pedidos')
      .update({ estado, comentarios_empresa, factura })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ message: 'Gestión guardada con éxito', data });
  } catch (error) {
    console.error('Error al guardar gestión:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. Obtener el detalle de un pedido
app.get('/api/pedidos/detalle/:codigo_pedido', async (req, res) => {
  const { codigo_pedido } = req.params;
  try {
    const { data, error } = await supabase
      .from('col_detalle_pedidos')
      .select('*')
      .eq('codigo_pedido', codigo_pedido);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error al obtener detalle:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Congreso corriendo en http://localhost:${PORT}`);
});