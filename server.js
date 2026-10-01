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

// 3. Detalle de Pedido con Mapeo Directo e Inherit de Códigos
app.get('/api/pedidos/detalle/:codigo_pedido', async (req, res) => {
  const { codigo_pedido } = req.params;
  console.log(`\n==========================================`);
  console.log(`🔍 PROCESANDO PEDIDO: ${codigo_pedido}`);

  try {
    // A) Obtener ítems del pedido
    const { data: detalles, error: errDetalles } = await supabase
      .from('col_detalle_pedidos')
      .select('*')
      .eq('codigo_pedido', codigo_pedido);

    if (errDetalles) throw errDetalles;

    // B) Obtener catálogo de artículos
    const { data: articulos, error: errArticulos } = await supabase
      .from('colcha_articulos')
      .select('codigo, nombre');

    if (errArticulos) throw errArticulos;

    // Función de limpieza de cadenas
    const limpiar = (txt) => (txt || '')
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

    // Crear mapa de Artículos: NombreLimpio -> Código
    const mapaArticulos = {};
    articulos.forEach(a => {
      if (a.nombre && a.codigo) {
        mapaArticulos[limpiar(a.nombre)] = a.codigo;
      }
    });

    // C) Pase 1: Búsqueda de códigos
    const resultadoPase1 = detalles.map(item => {
      const nombreLimpio = limpiar(item.producto);
      
      const nombreSinPromo = limpiar(
        (item.producto || '')
          .replace(/\(regalo\)/gi, '')
          .replace(/\(promo\)/gi, '')
          .replace(/\(bonificado\)/gi, '')
          .replace(/regalo/gi, '')
      );

      let cod = mapaArticulos[nombreLimpio] || mapaArticulos[nombreSinPromo] || item.codigo || null;

      return {
        ...item,
        codigo_articulo: cod,
        base_limpia: nombreSinPromo
      };
    });

    // D) Pase 2: Herencia entre hermanos si quedó sin código
    resultadoPase1.forEach(item => {
      if (!item.codigo_articulo) {
        const hermano = resultadoPase1.find(p => 
          p.codigo_articulo && (
            p.base_limpia === item.base_limpia ||
            p.base_limpia.includes(item.base_limpia) ||
            item.base_limpia.includes(p.base_limpia)
          )
        );

        if (hermano) {
          item.codigo_articulo = hermano.codigo_articulo;
          console.log(`✨ HERENCIA APLICADA: "${item.producto}" hereda el código "${hermano.codigo_articulo}"`);
        } else {
          item.codigo_articulo = 'SIN_CODIGO';
        }
      }

      console.log(`📦 Producto: "${item.producto}" -> Código Final: ${item.codigo_articulo}`);
    });

    console.log(`==========================================\n`);
    res.json(resultadoPase1);
  } catch (error) {
    console.error('Error al obtener detalle:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});