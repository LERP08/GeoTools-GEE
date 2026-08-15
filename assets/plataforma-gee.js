/**
 * Plataforma Geoespacial para Google Earth Engine
 * Análisis óptico (Sentinel-2 / Landsat 8-9), cobertura de suelo y DEM.
 *
 * Uso: dibuja o importa un polígono y nómbralo "table" antes de ejecutar.
 */

// -----------------------------------------------------------------------------
// Validación de entrada e inicio seguro
// -----------------------------------------------------------------------------
if (typeof table === 'undefined') {
  print('⚠️ No se encontró la variable "table". Dibuja o importa un polígono y nómbralo "table".');
} else {
  iniciarAplicacion(table);
}

function iniciarAplicacion(roi) {
  Map.centerObject(roi, 12);

  var INDICES_CONFIG = {
    NDVI: {nombre: 'NDVI (Vegetación)', colorGrafico: 'forestgreen', vis: {min: -0.2, max: 0.9, palette: ['#2c7bb6', '#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9850']}},
    NDWI: {nombre: 'NDWI (Humedad/Agua)', colorGrafico: 'blue', vis: {min: -0.5, max: 0.5, palette: ['#fc8d59', '#ffffbf', '#91bfdb', '#4575b4']}},
    MNDWI: {nombre: 'MNDWI (Agua modificado)', colorGrafico: 'darkblue', vis: {min: -0.5, max: 0.5, palette: ['#d7191c', '#fdae61', '#abd9e9', '#2c7bb6']}},
    SAVI: {nombre: 'SAVI (Vegetación ajustada por suelo)', colorGrafico: 'orange', vis: {min: -0.2, max: 0.9, palette: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#a6d96a', '#1a9850', '#006837']}}
  };

  var SENSORES_CONFIG = {
    sentinel: {
      nombre: 'Sentinel-2', escala: 10, anioMin: 2015,
      visRGB: {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}
    },
    landsat: {
      nombre: 'Landsat 8/9', escala: 30, anioMin: 2013,
      visRGB: {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}
    }
  };

  var LULC_PALETTE = ['419BDF', '397D49', '88B053', '7A87C6', 'E49635', 'DFC35A', 'C4281B', 'A59B8F', 'B39FE1'];
  var LULC_CLASSES = [
    {nombre: 'Agua', color: '#419BDF'}, {nombre: 'Bosque', color: '#397D49'},
    {nombre: 'Pastos', color: '#88B053'}, {nombre: 'Vegetación inundada', color: '#7A87C6'},
    {nombre: 'Cultivos', color: '#E49635'}, {nombre: 'Matorral', color: '#DFC35A'},
    {nombre: 'Urbano', color: '#C4281B'}, {nombre: 'Suelo desnudo', color: '#A59B8F'},
    {nombre: 'Nieve/Hielo', color: '#B39FE1'}
  ];

  var leyendaPrincipal = null;
  var listadoLeyendas = {};
  var capasGeneradas = [];
  var FOLDER_EXPORTACION = 'Resultados_Geoespaciales';

  // ---------------------------------------------------------------------------
  // Interfaz
  // ---------------------------------------------------------------------------
  var panelControl = ui.Panel({style: {width: '365px', padding: '15px', backgroundColor: '#f9fafb'}});
  panelControl.add(ui.Label('🌍 Plataforma Geoespacial', {fontWeight: 'bold', fontSize: '22px', color: '#1e40af'}));
  panelControl.add(ui.Label('Análisis satelital y topográfico para un área de estudio.', {fontSize: '11px', color: '#4b5563', margin: '0 0 2px 0'}));
  panelControl.add(ui.Label('Creado por Ing. Luis Edilson Reyes Perez', {fontSize: '11px', color: '#4b5563', fontStyle: 'italic', margin: '0 0 15px 0'}));

  panelControl.add(ui.Label('1. TIPO DE ANÁLISIS', {fontWeight: 'bold', color: '#991b1b', fontSize: '13px'}));
  var tipoSelect = ui.Select({
    items: [{label: '🛰️ Análisis óptico (satelital)', value: 'optico'}, {label: '⛰️ Análisis topográfico (DEM)', value: 'dem'}],
    value: 'optico', style: {stretch: 'horizontal', margin: '0 0 12px 0'}
  });
  panelControl.add(tipoSelect);

  var pOptico = ui.Panel({style: {backgroundColor: '#f9fafb'}});
  var sensorSelect = ui.Select({
    items: [{label: '🟢 Sentinel-2 (10 m, mayor detalle)', value: 'sentinel'}, {label: '🟤 Landsat 8/9 (30 m, mayor historial)', value: 'landsat'}],
    value: 'sentinel', style: {stretch: 'horizontal'}
  });
  var lblInfoSensor = ui.Label('', {fontSize: '10px', color: '#6b7280', margin: '2px 0 10px 0'});
  pOptico.add(ui.Label('Sensor satelital:', {fontWeight: 'bold', fontSize: '12px'})).add(sensorSelect).add(lblInfoSensor);

  var anioActual = new Date().getFullYear();
  var anios = [];
  for (var a = anioActual; a >= 2015; a--) anios.push(String(a));
  var anioSelect = ui.Select({items: anios, value: String(anioActual), style: {stretch: 'horizontal'}});
  pOptico.add(ui.Label('Año de análisis:', {fontWeight: 'bold', fontSize: '12px'})).add(anioSelect);

  var chkRangoPersonalizado = ui.Checkbox({label: 'Usar rango de fechas personalizado', value: false});
  var fechaInicioBox = ui.Textbox({placeholder: 'YYYY-MM-DD', value: anioActual + '-01-01', style: {width: '125px'}});
  var fechaFinBox = ui.Textbox({placeholder: 'YYYY-MM-DD', value: anioActual + '-12-31', style: {width: '125px'}});
  var pRangoFechas = ui.Panel({
    widgets: [ui.Label('Desde:', {fontSize: '11px'}), fechaInicioBox, ui.Label('Hasta:', {fontSize: '11px', margin: '0 0 0 6px'}), fechaFinBox],
    layout: ui.Panel.Layout.flow('horizontal'), style: {shown: false, margin: '4px 0 8px 0'}
  });
  chkRangoPersonalizado.onChange(function(valor) { pRangoFechas.style().set('shown', valor); });
  pOptico.add(chkRangoPersonalizado).add(pRangoFechas);

  var maxNubes = ui.Slider({min: 0, max: 100, value: 30, step: 5, style: {stretch: 'horizontal'}});
  pOptico.add(ui.Label('Máximo de nubes por escena (%):', {fontWeight: 'bold', fontSize: '12px'})).add(maxNubes);
  pOptico.add(ui.Label('También se aplica una máscara de nubes y sombras por píxel.', {fontSize: '10px', color: '#6b7280', margin: '2px 0 10px 0'}));

  pOptico.add(ui.Label('Productos a generar:', {fontWeight: 'bold', fontSize: '12px', margin: '10px 0 4px 0'}));
  var chkRGB = ui.Checkbox({label: 'Color real (RGB)', value: false});
  var chkNDVI = ui.Checkbox({label: 'NDVI (vegetación)', value: true});
  var chkNDWI = ui.Checkbox({label: 'NDWI (humedad/agua)', value: false});
  var chkMNDWI = ui.Checkbox({label: 'MNDWI (agua modificado)', value: false});
  var chkSAVI = ui.Checkbox({label: 'SAVI (vegetación y suelo)', value: false});
  var chkLULC = ui.Checkbox({label: 'Cobertura de suelo (Dynamic World)', value: false});
  pOptico.add(chkRGB).add(chkNDVI).add(chkNDWI).add(chkMNDWI).add(chkSAVI).add(chkLULC);

  var pDem = ui.Panel({style: {shown: false, backgroundColor: '#f9fafb'}});
  var demSelect = ui.Select({items: [{label: 'SRTM (NASA, 30 m)', value: 'srtm'}, {label: 'ALOS AW3D30 (30 m)', value: 'alos'}], value: 'srtm', style: {stretch: 'horizontal'}});
  pDem.add(ui.Label('Modelo de elevación:', {fontWeight: 'bold', fontSize: '12px'})).add(demSelect);
  pDem.add(ui.Label('Derivados topográficos:', {fontWeight: 'bold', fontSize: '12px', margin: '12px 0 4px 0'}));
  var chkElev = ui.Checkbox({label: 'Elevación', value: true});
  var chkSlope = ui.Checkbox({label: 'Pendiente', value: true});
  var chkAspect = ui.Checkbox({label: 'Orientación', value: false});
  var chkHillshade = ui.Checkbox({label: 'Relieve sombreado', value: true});
  pDem.add(chkElev).add(chkSlope).add(chkAspect).add(chkHillshade);

  panelControl.add(pOptico).add(pDem);
  var btnProcesar = ui.Button({label: '🚀 Ejecutar análisis', style: {stretch: 'horizontal', backgroundColor: '#e5e7eb', margin: '18px 0 10px 0', border: '1px solid #9ca3af', fontWeight: 'bold'}});
  var pEstado = ui.Panel({style: {backgroundColor: '#e5e7eb', padding: '9px', borderRadius: '5px'}});
  panelControl.add(btnProcesar).add(pEstado);
  ui.root.insert(0, panelControl);

  function actualizarInfoSensor() {
    var cfg = SENSORES_CONFIG[sensorSelect.getValue()];
    lblInfoSensor.setValue('Resolución: ' + cfg.escala + ' m/píxel · Disponible desde ' + cfg.anioMin + '.');
  }
  sensorSelect.onChange(actualizarInfoSensor);
  actualizarInfoSensor();
  tipoSelect.onChange(function(valor) { pOptico.style().set('shown', valor === 'optico'); pDem.style().set('shown', valor === 'dem'); });

  // ---------------------------------------------------------------------------
  // Utilidades de interfaz, validación y capas
  // ---------------------------------------------------------------------------
  function mostrarEstado(texto, color) {
    pEstado.clear();
    pEstado.add(ui.Label(texto, {color: color || '#1f2937', fontSize: '11px', fontWeight: 'bold'}));
  }

  function limpiarCapasGeneradas() {
    capasGeneradas.forEach(function(capa) { Map.layers().remove(capa); });
    capasGeneradas = [];
    if (leyendaPrincipal) { Map.remove(leyendaPrincipal); leyendaPrincipal = null; }
  }

  function agregarCapa(imagen, vis, nombre, visible, opacidad) {
    var capa = ui.Map.Layer(imagen, vis, nombre, visible, opacidad);
    Map.layers().add(capa);
    capasGeneradas.push(capa);
  }

  function fechaValida(fecha) {
    return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !isNaN(Date.parse(fecha + 'T00:00:00Z'));
  }

  function obtenerFechas() {
    if (!chkRangoPersonalizado.getValue()) {
      var anio = anioSelect.getValue();
      return {inicio: anio + '-01-01', fin: (Number(anio) + 1) + '-01-01', etiqueta: anio};
    }
    var inicio = fechaInicioBox.getValue().trim();
    var fin = fechaFinBox.getValue().trim();
    if (!fechaValida(inicio) || !fechaValida(fin)) return null;
    if (Date.parse(inicio + 'T00:00:00Z') >= Date.parse(fin + 'T00:00:00Z')) return null;
    return {inicio: inicio, fin: fin, etiqueta: inicio + ' a ' + fin};
  }

  function numero(valor, decimales) {
    return (valor === null || valor === undefined) ? 'sin datos' : Number(valor).toFixed(decimales);
  }

  // ---------------------------------------------------------------------------
  // Colecciones e índices
  // ---------------------------------------------------------------------------
  function maskS2clouds(imagen) {
    var scl = imagen.select('SCL');
    var mascara = scl.neq(0).and(scl.neq(1)).and(scl.neq(3))
      .and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
    return imagen.updateMask(mascara).copyProperties(imagen, ['system:time_start']);
  }

  function maskLandsatClouds(imagen) {
    var qa = imagen.select('QA_PIXEL');
    var mascara = qa.bitwiseAnd(1 << 1).eq(0) // nube dilatada
      .and(qa.bitwiseAnd(1 << 2).eq(0))       // cirro
      .and(qa.bitwiseAnd(1 << 3).eq(0))       // nube
      .and(qa.bitwiseAnd(1 << 4).eq(0));      // sombra de nube
    return imagen.updateMask(mascara).copyProperties(imagen, ['system:time_start']);
  }

  function obtenerColeccionOptica(sensor, inicio, fin, nubes) {
    if (sensor === 'sentinel') {
      return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi).filterDate(inicio, fin)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', nubes))
        .map(maskS2clouds)
        .map(function(imagen) { return imagen.select(['B2', 'B3', 'B4', 'B8', 'B11']).copyProperties(imagen, ['system:time_start']); });
    }
    var filtro = ee.Filter.and(ee.Filter.bounds(roi), ee.Filter.date(inicio, fin), ee.Filter.lt('CLOUD_COVER', nubes));
    return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filter(filtro)
      .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filter(filtro))
      .map(maskLandsatClouds)
      .map(function(imagen) {
        return imagen.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6'])
          .multiply(0.0000275).add(-0.2)
          .rename(['B2', 'B3', 'B4', 'B8', 'B11'])
          .copyProperties(imagen, ['system:time_start']);
      });
  }

  function agregarIndices(imagen) {
    var verde = imagen.select('B3');
    var rojo = imagen.select('B4');
    var nir = imagen.select('B8');
    var swir = imagen.select('B11').resample('bilinear');
    var ndvi = nir.subtract(rojo).divide(nir.add(rojo)).rename('NDVI');
    var ndwi = verde.subtract(nir).divide(verde.add(nir)).rename('NDWI');
    var mndwi = verde.subtract(swir).divide(verde.add(swir)).rename('MNDWI');
    var savi = nir.subtract(rojo).multiply(1.5).divide(nir.add(rojo).add(0.5)).rename('SAVI');
    return imagen.addBands([ndvi, ndwi, mndwi, savi]).copyProperties(imagen, ['system:time_start']);
  }

  // ---------------------------------------------------------------------------
  // Procesamiento óptico
  // ---------------------------------------------------------------------------
  function procesarLulc(inicio, fin, etiqueta) {
    var coleccionDW = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(roi).filterDate(inicio, fin);
    coleccionDW.size().evaluate(function(total, error) {
      if (error || !total) { print('⚠️ Dynamic World no tiene imágenes para el período seleccionado.'); return; }
      var dw = coleccionDW.select('label').mode().clip(roi);
      agregarCapa(dw, {min: 0, max: 8, palette: LULC_PALETTE}, 'Cobertura de suelo · ' + etiqueta, true, 1);
      listadoLeyendas.LULC = {tipo: 'categorica', clases: LULC_CLASSES, titulo: 'Cobertura de suelo (Dynamic World)'};
      construirPanelLeyendas();
      var areaImg = ee.Image.pixelArea().divide(10000).rename('area_ha').addBands(dw.rename('clase'));
      var areas = areaImg.reduceRegion({reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'clase'}), geometry: roi, scale: 10, maxPixels: 1e10, tileScale: 4});
      var grupos = ee.List(areas.get('groups'));
      var tablaAreas = ee.FeatureCollection(grupos.map(function(grupo) { return ee.Feature(null, ee.Dictionary(grupo)); }));
      Export.image.toDrive({image: dw, description: 'LULC_DynamicWorld_' + etiqueta.replace(/[^0-9A-Za-z]/g, '_'), folder: FOLDER_EXPORTACION, scale: 10, region: roi, maxPixels: 1e13});
      Export.table.toDrive({collection: tablaAreas, description: 'Area_LULC_' + etiqueta.replace(/[^0-9A-Za-z]/g, '_'), folder: FOLDER_EXPORTACION, fileFormat: 'CSV'});
      areas.evaluate(function(resultado) {
        if (!resultado || !resultado.groups) return;
        print('ÁREA POR CLASE DE COBERTURA (ha)');
        resultado.groups.forEach(function(grupo) {
          var clase = LULC_CLASSES[grupo.clase] ? LULC_CLASSES[grupo.clase].nombre : 'Clase ' + grupo.clase;
          print('• ' + clase + ': ' + numero(grupo.sum, 2) + ' ha');
        });
      });
    });
  }

  function procesarOptico(fechas, seleccion) {
    var sensor = sensorSelect.getValue();
    var cfg = SENSORES_CONFIG[sensor];
    var prefijo = sensor === 'sentinel' ? 'S2' : 'L89';
    var coleccion = obtenerColeccionOptica(sensor, fechas.inicio, fechas.fin, maxNubes.getValue());
    coleccion.size().evaluate(function(total, error) {
      if (error) { finalizarConError('No se pudo consultar la colección: ' + error); return; }
      if (!total) { finalizarConError('No se encontraron imágenes de ' + cfg.nombre + '. Ajusta las fechas o el filtro de nubes.'); return; }

      mostrarEstado('⏳ Procesando ' + total + ' imágenes de ' + cfg.nombre + '...', '#d97706');
      var procesada = coleccion.map(agregarIndices);
      var mediana = procesada.median().clip(roi);
      agregarCapa(roi, {color: 'red', fillColor: '00000000'}, 'Área de estudio', true, 0.7);

      if (seleccion.rgb) agregarCapa(mediana, cfg.visRGB, 'Color real · ' + cfg.nombre + ' · ' + fechas.etiqueta, true, 1);
      var estadisticas = [];
      seleccion.indices.forEach(function(indice) {
        var capa = mediana.select(indice);
        agregarCapa(capa, INDICES_CONFIG[indice].vis, indice + ' · ' + fechas.etiqueta, true, 1);
        listadoLeyendas[indice] = {tipo: 'gradiente', vis: INDICES_CONFIG[indice].vis, titulo: INDICES_CONFIG[indice].nombre};
        var stats = capa.reduceRegion({reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), null, true), geometry: roi, scale: cfg.escala, maxPixels: 1e10, tileScale: 4});
        estadisticas.push(ee.Feature(null, stats).set({indice: indice, sensor: cfg.nombre, periodo: fechas.etiqueta, imagenes_usadas: total, escala_m: cfg.escala}));
        stats.evaluate(function(resultado, err) {
          if (err || !resultado) { print('⚠️ Sin estadísticas para ' + indice + '.'); return; }
          print('📈 ' + indice + ' | mín: ' + numero(resultado[indice + '_min'], 3) + ' | máx: ' + numero(resultado[indice + '_max'], 3) + ' | promedio: ' + numero(resultado[indice + '_mean'], 3));
        });
        var grafico = ui.Chart.image.series({imageCollection: procesada.select(indice), region: roi, reducer: ee.Reducer.mean(), scale: cfg.escala})
          .setOptions({title: 'Evolución temporal: ' + indice + ' · ' + cfg.nombre, hAxis: {title: 'Fecha'}, vAxis: {title: 'Valor ' + indice}, series: {0: {color: INDICES_CONFIG[indice].colorGrafico, lineWidth: 2}}});
        print(grafico);
        Export.image.toDrive({image: capa, description: indice + '_' + prefijo + '_' + fechas.etiqueta.replace(/[^0-9A-Za-z]/g, '_'), folder: FOLDER_EXPORTACION, scale: cfg.escala, region: roi, maxPixels: 1e13});
      });
      if (seleccion.rgb) Export.image.toDrive({image: mediana.select(['B4', 'B3', 'B2']), description: 'RGB_' + prefijo + '_' + fechas.etiqueta.replace(/[^0-9A-Za-z]/g, '_'), folder: FOLDER_EXPORTACION, scale: cfg.escala, region: roi, maxPixels: 1e13});
      if (estadisticas.length) Export.table.toDrive({collection: ee.FeatureCollection(estadisticas), description: 'Estadisticas_indices_' + prefijo + '_' + fechas.etiqueta.replace(/[^0-9A-Za-z]/g, '_'), folder: FOLDER_EXPORTACION, fileFormat: 'CSV'});
      if (seleccion.lulc) procesarLulc(fechas.inicio, fechas.fin, fechas.etiqueta);
      construirPanelLeyendas();
      finalizarCorrectamente('✅ Tareas creadas con ' + total + ' imágenes. Inícialas desde la pestaña Tasks.');
    });
  }

  // ---------------------------------------------------------------------------
  // Procesamiento DEM
  // ---------------------------------------------------------------------------
  function procesarDem() {
    var modelo = demSelect.getValue();
    var dem = modelo === 'srtm'
      ? ee.Image('USGS/SRTMGL1_003').rename('Elevacion')
      : ee.ImageCollection('JAXA/ALOS/AW3D30/V3_2').mosaic().select('DSM').rename('Elevacion');
    dem = dem.clip(roi);
    var exportar = ee.Image([]);
    var estadisticas = ee.Image([]);
    var hayProductos = false;
    agregarCapa(roi, {color: 'red', fillColor: '00000000'}, 'Área de estudio', true, 0.7);

    if (chkElev.getValue()) {
      var visElev = {min: 0, max: 3000, palette: ['006600', '002200', 'fff700', 'ab7634', 'c4d0ff', 'ffffff']};
      agregarCapa(dem, visElev, 'Elevación (m)', true, 0.65);
      listadoLeyendas.Elevacion = {tipo: 'gradiente', vis: visElev, titulo: 'Elevación (m s. n. m.)'};
      exportar = exportar.addBands(dem); estadisticas = estadisticas.addBands(dem); hayProductos = true;
    }
    if (chkSlope.getValue()) {
      var pendiente = ee.Terrain.slope(dem).rename('Pendiente');
      var visPendiente = {min: 0, max: 60, palette: ['white', 'yellow', 'red', 'darkred']};
      agregarCapa(pendiente, visPendiente, 'Pendiente (°)', false, 1);
      listadoLeyendas.Pendiente = {tipo: 'gradiente', vis: visPendiente, titulo: 'Pendiente (grados)'};
      exportar = exportar.addBands(pendiente); estadisticas = estadisticas.addBands(pendiente); hayProductos = true;
    }
    if (chkAspect.getValue()) {
      var orientacion = ee.Terrain.aspect(dem).rename('Orientacion');
      var visOrientacion = {min: 0, max: 360, palette: ['blue', 'green', 'red', 'blue']};
      agregarCapa(orientacion, visOrientacion, 'Orientación de laderas (°)', false, 1);
      listadoLeyendas.Orientacion = {tipo: 'gradiente', vis: visOrientacion, titulo: 'Orientación (grados)'};
      exportar = exportar.addBands(orientacion); estadisticas = estadisticas.addBands(orientacion); hayProductos = true;
    }
    if (chkHillshade.getValue()) {
      var relieve = ee.Terrain.hillshade(dem, 315, 45).rename('Hillshade');
      agregarCapa(relieve, {min: 0, max: 255}, 'Relieve sombreado', true, 0.7);
      exportar = exportar.addBands(relieve); hayProductos = true;
    }
    if (!hayProductos) { finalizarConError('Selecciona al menos un producto topográfico.'); return; }
    if (chkElev.getValue() || chkSlope.getValue() || chkAspect.getValue()) {
      var stats = estadisticas.reduceRegion({reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), null, true), geometry: roi, scale: 30, maxPixels: 1e10, tileScale: 4});
      Export.table.toDrive({collection: ee.FeatureCollection([ee.Feature(null, stats).set('modelo', modelo)]), description: 'Estadisticas_DEM_' + modelo.toUpperCase(), folder: FOLDER_EXPORTACION, fileFormat: 'CSV'});
      stats.evaluate(function(resultado) { print('Estadísticas DEM (' + modelo.toUpperCase() + '):', resultado); });
    }
    Export.image.toDrive({image: exportar, description: 'DEM_' + modelo.toUpperCase(), folder: FOLDER_EXPORTACION, scale: 30, region: roi, maxPixels: 1e13});
    construirPanelLeyendas();
    finalizarCorrectamente('✅ Tareas DEM creadas. Inícialas desde la pestaña Tasks.');
  }

  // ---------------------------------------------------------------------------
  // Leyendas, ejecución y manejo de errores
  // ---------------------------------------------------------------------------
  function construirPanelLeyendas() {
    var llaves = Object.keys(listadoLeyendas);
    if (!llaves.length) return;
    if (leyendaPrincipal) Map.remove(leyendaPrincipal);
    var selector = ui.Select({items: llaves, value: llaves[0], style: {width: '100%', margin: '0 0 8px 0'}});
    var contenido = ui.Panel({layout: ui.Panel.Layout.flow('vertical')});
    leyendaPrincipal = ui.Panel({style: {position: 'bottom-right', padding: '10px', backgroundColor: '#ffffffee', width: '205px'}});
    leyendaPrincipal.add(ui.Label('🌿 Leyendas del mapa', {fontWeight: 'bold', fontSize: '13px'})).add(selector).add(contenido);
    Map.add(leyendaPrincipal);
    function actualizar(llave) {
      contenido.clear();
      var config = listadoLeyendas[llave];
      if (config.tipo === 'gradiente') {
        var gradiente = ee.Image.pixelLonLat().select('longitude').multiply(config.vis.max - config.vis.min).add(config.vis.min);
        var barra = ui.Thumbnail({image: gradiente, params: {bbox: [0, 0, 1, 0.1], dimensions: '150x15', format: 'png', min: config.vis.min, max: config.vis.max, palette: config.vis.palette.join(',')}, style: {stretch: 'horizontal', margin: '5px 0'}});
        contenido.add(ui.Label(config.titulo, {fontWeight: 'bold', fontSize: '11px'})).add(barra);
        var etiquetas = ui.Panel({
          widgets: [
            ui.Label(config.vis.min.toFixed(1), {fontSize: '10px', width: '75px', textAlign: 'left'}),
            ui.Label(config.vis.max.toFixed(1), {fontSize: '10px', width: '75px', textAlign: 'right'})
          ],
          layout: ui.Panel.Layout.flow('horizontal'),
          style: {width: '150px', margin: '0'}
        });
        contenido.add(etiquetas);
      } else {
        contenido.add(ui.Label(config.titulo, {fontWeight: 'bold', fontSize: '11px'}));
        config.clases.forEach(function(clase) { contenido.add(ui.Label('■ ' + clase.nombre, {color: clase.color, fontSize: '11px'})); });
      }
    }
    selector.onChange(actualizar);
    actualizar(llaves[0]);
  }

  function finalizarCorrectamente(mensaje) { btnProcesar.setDisabled(false); mostrarEstado(mensaje, '#15803d'); }
  function finalizarConError(mensaje) { btnProcesar.setDisabled(false); mostrarEstado('⚠️ ' + mensaje, '#b91c1c'); }

  btnProcesar.onClick(function() {
    btnProcesar.setDisabled(true);
    limpiarCapasGeneradas();
    listadoLeyendas = {};
    if (tipoSelect.getValue() === 'dem') { procesarDem(); return; }
    var fechas = obtenerFechas();
    if (!fechas) { finalizarConError('Ingresa fechas válidas y asegúrate de que la fecha inicial sea anterior a la final.'); return; }
    var seleccion = {
      rgb: chkRGB.getValue(), lulc: chkLULC.getValue(), indices: []
    };
    if (chkNDVI.getValue()) seleccion.indices.push('NDVI');
    if (chkNDWI.getValue()) seleccion.indices.push('NDWI');
    if (chkMNDWI.getValue()) seleccion.indices.push('MNDWI');
    if (chkSAVI.getValue()) seleccion.indices.push('SAVI');
    if (!seleccion.rgb && !seleccion.lulc && !seleccion.indices.length) { finalizarConError('Selecciona al menos un producto óptico.'); return; }
    mostrarEstado('⏳ Consultando imágenes disponibles...', '#d97706');
    if (!seleccion.rgb && !seleccion.indices.length && seleccion.lulc) {
      agregarCapa(roi, {color: 'red', fillColor: '00000000'}, 'Área de estudio', true, 0.7);
      procesarLulc(fechas.inicio, fechas.fin, fechas.etiqueta);
      construirPanelLeyendas();
      finalizarCorrectamente('✅ Tareas LULC solicitadas. Inícialas desde la pestaña Tasks.');
    } else {
      procesarOptico(fechas, seleccion);
    }
  });
}
