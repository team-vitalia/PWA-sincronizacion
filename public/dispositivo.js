// dispositivo.js

// ==========================================
// 0. DATOS DE LAS NOTICIAS (Simulando la API)
// ==========================================
const noticias = [
  {
    id: 1,
    titulo: "Artemis II: La tripulación se prepara para la Luna",
    imagen: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000&auto=format&fit=crop",
    texto: "La NASA ha confirmado que la tripulación de Artemis II está lista para su histórico viaje alrededor de la Luna. Esta misión marcará el regreso de humanos a la órbita lunar después de más de 50 años."
  },
  {
    id: 2,
    titulo: "SpaceX lanza nuevo lote de satélites Starlink",
    imagen: "https://images.unsplash.com/photo-1517976487492-5750f3195933?q=80&w=1000&auto=format&fit=crop",
    texto: "Un cohete Falcon 9 despegó exitosamente esta madrugada llevando 22 nuevos satélites de internet a la órbita baja terrestre, continuando con la expansión de la red global."
  },
  {
    id: 3,
    titulo: "El Telescopio James Webb descubre nueva exotierra",
    imagen: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=1000&auto=format&fit=crop",
    texto: "Astrónomos han detectado un planeta rocoso a 40 años luz de distancia que podría tener condiciones para albergar agua líquida. Será un objetivo prioritario para futuras observaciones."
  }
];

let indiceNoticiaActual = 0;

// Elementos del DOM
const elTitulo = document.getElementById('titulo-noticia');
const elImagen = document.getElementById('imagen-noticia');
const elTexto = document.getElementById('texto-noticia');
const elIndicador = document.getElementById('indicador-pagina');
const btnAnterior = document.getElementById('btn-anterior');
const btnSiguiente = document.getElementById('btn-siguiente');

// ==========================================
// 1. FUNCIÓN PARA CARGAR LA NOTICIA EN EL DOM
// ==========================================
function cargarNoticia(index) {
  const noticia = noticias[index];
  
  // Actualizar textos e imágenes
  elTitulo.innerText = noticia.titulo;
  elImagen.src = noticia.imagen;
  elTexto.innerText = noticia.texto;
  elIndicador.innerText = `Noticia ${index + 1} de ${noticias.length}`;

  // Habilitar/Deshabilitar botones de navegación
  btnAnterior.disabled = index === 0;
  btnSiguiente.disabled = index === noticias.length - 1;

  // Limpiar estados anteriores (ubicación, cámara, etc.) al cambiar de noticia
  document.getElementById('resultado-ubicacion').style.display = 'none';
  document.getElementById('contenedor-camara').style.display = 'none';
  document.getElementById('btn-abrir-camara').style.display = 'block';
}

// Eventos de navegación
btnSiguiente.addEventListener('click', () => {
  if (indiceNoticiaActual < noticias.length - 1) {
    indiceNoticiaActual++;
    cargarNoticia(indiceNoticiaActual);
  }
});

btnAnterior.addEventListener('click', () => {
  if (indiceNoticiaActual > 0) {
    indiceNoticiaActual--;
    cargarNoticia(indiceNoticiaActual);
  }
});

// ==========================================
// 2. FUNCIÓN PARA NOTIFICACIONES (Contextualizada)
// ==========================================
function mostrarNotificacion() {
  if (!('Notification' in window)) {
    alert('Este navegador no soporta notificaciones.');
    return;
  }

  // Obtenemos el título de la noticia que se está viendo AHORA
  const tituloActual = noticias[indiceNoticiaActual].titulo;

  Notification.requestPermission().then(permiso => {
    if (permiso === 'granted') {
      new Notification('CosmoBitácora - Alerta de Noticia', {
        body: `Te has suscrito a alertas sobre: "${tituloActual}". 🚀`,
        icon: 'icons/icon.svg'
      });
    } else {
      alert('Permiso de notificación denegado.');
    }
  });
}

// ==========================================
// 3. FUNCIÓN PARA GEOLOCALIZACIÓN (Contextualizada)
// ==========================================
function obtenerUbicacion() {
  if (!navigator.geolocation) {
    alert('Geolocalización no soportada por este navegador.');
    return;
  }

  const textoResultado = document.getElementById('resultado-ubicacion');
  textoResultado.style.display = 'block';
  textoResultado.textContent = "Buscando tu ubicación actual...";

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      const lat = posicion.coords.latitude;
      const lon = posicion.coords.longitude;
      
      textoResultado.innerHTML = `📍 Estás leyendo esta noticia desde:<br><b>Lat: ${lat.toFixed(4)} | Lon: ${lon.toFixed(4)}</b>`;
    },
    (error) => {
      console.error('Error al obtener ubicación:', error);
      textoResultado.textContent = "❌ No se pudo obtener la ubicación. Revisa los permisos.";
    }
  );
}

// ==========================================
// 4. FUNCIONES PARA LA CÁMARA (Contextualizada)
// ==========================================
let streamCamara = null; 
let fotoTomadaBase64 = null; 

async function abrirCamara() {
  const video = document.getElementById('video-camara');
  const contenedor = document.getElementById('contenedor-camara');
  const btnAbrir = document.getElementById('btn-abrir-camara');
  const btnTomar = document.getElementById('btn-tomar-foto');
  const preview = document.getElementById('foto-preview');

  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    
    contenedor.style.display = 'block';
    video.style.display = 'block';
    btnAbrir.style.display = 'none';
    btnTomar.style.display = 'block';
    preview.style.display = 'none';
    video.srcObject = streamCamara;
    
  } catch (error) {
    console.error('Error al acceder a la cámara:', error);
    alert('No se pudo acceder a la cámara. Revisa los permisos.');
  }
}

function tomarFoto() {
  const video = document.getElementById('video-camara');
  const canvas = document.getElementById('canvas-foto');
  const preview = document.getElementById('foto-preview');
  const btnTomar = document.getElementById('btn-tomar-foto');
  const btnGuardar = document.getElementById('btn-guardar-foto');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  fotoTomadaBase64 = canvas.toDataURL('image/png');
  preview.src = fotoTomadaBase64;
  preview.style.display = 'block';
  
  if (streamCamara) streamCamara.getTracks().forEach(track => track.stop());
  
  video.style.display = 'none';
  btnTomar.style.display = 'none';
  btnGuardar.style.display = 'block';
}

function guardarFotoEnBitacora() {
  if (!fotoTomadaBase64) return;

  // Obtenemos el título de la noticia actual para relacionar la foto
  const tituloActual = noticias[indiceNoticiaActual].titulo;

  let notasVisuales = JSON.parse(localStorage.getItem('notas_visuales')) || [];
  
  const nuevaNota = {
    id: Date.now(),
    fecha: new Date().toLocaleString(),
    tipo: 'foto_reaccion',
    noticiaRelacionada: tituloActual,
    imagen: fotoTomadaBase64,
    texto: `Mi reacción a la noticia: ${tituloActual}`
  };
  
  notasVisuales.push(nuevaNota);
  localStorage.setItem('notas_visuales', JSON.stringify(notasVisuales));
  
  alert(`¡Foto guardada en tu bitácora como reacción a "${tituloActual}"! 📸`);
  
  document.getElementById('btn-guardar-foto').style.display = 'none';
  document.getElementById('foto-preview').style.display = 'none';
  document.getElementById('btn-abrir-camara').style.display = 'block';
  document.getElementById('contenedor-camara').style.display = 'none';
  fotoTomadaBase64 = null;
}

// ==========================================
// 5. INICIALIZAR EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Cargar la primera noticia al abrir la página
  cargarNoticia(0);

  // Vincular eventos de los botones
  document.getElementById('btn-notificacion').addEventListener('click', mostrarNotificacion);
  document.getElementById('btn-ubicacion').addEventListener('click', obtenerUbicacion);
  document.getElementById('btn-abrir-camara').addEventListener('click', abrirCamara);
  document.getElementById('btn-tomar-foto').addEventListener('click', tomarFoto);
  document.getElementById('btn-guardar-foto').addEventListener('click', guardarFotoEnBitacora);
});