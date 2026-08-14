# StableDiffusionCppUI

Frontend de escritorio para [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp). Construido con Tauri 2, vanilla HTML/CSS/JavaScript y Rust.

La aplicación no incluye ni el binario `sd-cli` ni los modelos. Estos se configuran por separado.

Puedes encontrar una detallada guía de instalación de stable-diffusion.cpp en [ai.manz.dev](https://ai.manz.dev/models/image/#guias-de-uso). Los modelos se descargan de [Hugging Face](https://huggingface.co)

## Desarrollo

```bash
pnpm tauri dev
```

## Compilación

```bash
pnpm tauri build
```

Genera el instalador en `src-tauri/target/release/bundle/`.

## Configuración inicial

Al abrir la aplicación, configurar las rutas en el sidebar:

- **SD-cpp**: Carpeta donde está `sd-cli.exe`
- **Output**: Carpeta de salida de imágenes
- **Modelos**: Carpeta con los modelos (.safetensors, .ckpt, .bin, .gguf)
- **VAE, LLM Encoder, LoRA, CLIP-L, CLIP-G, T5XXL**: Carpetas con cada tipo de modelo
- **Upscalers**: Carpeta con modelos de escalado (.gguf)

## Generación de imágenes

1. Seleccionar modelo y tipo (Diffusion o Monolithic)
2. Escribir un prompt
3. Configurar parámetros (ancho, alto, steps, CFG, seed, etc.)
4. Pulsar "EJECUTAR"

La consola muestra el progreso en tiempo real. Al terminar, la imagen aparece en el área de preview.

## Img2Img

1. Abrir "Imagen como input" y seleccionar una imagen
2. Seleccionar el modo "img2img"
3. Ajustar el strength (0 = sin cambios, 1 = regeneración completa)
4. Opcionalmente, usar los botones de tamaño para copiar las dimensiones de la imagen
5. Escribir el prompt, configurar los parámetros de generación (steps, CFG, seed, etc.) desde el resto de la app y pulsar "EJECUTAR"

Las imágenes generadas se guardan en `output/img2img/`. Se aplica corrección automática de orientación EXIF.

## Upscale

### Desde la barra de acciones

Después de generar una imagen, pulsar "Upscale" en la barra de acciones. Seleccionar modelo y pulsar "Ejecutar". La imagen escalada se guarda en `output/scaled/`.

### Desde "Imagen como input"

Abrir la sección, seleccionar una imagen externa, marcar "Upscale", elegir modelo y ejecutar. Permite escalar sin pasar por generación.

## Plantillas de prompts

Guardar pares de prompt + negative prompt con un nombre en la sección "Prompts" del sidebar. Seleccionar y pulsar "Cargar" para reutilizarlos.

## Preajustes

Guardan todos los parámetros de generación (modelo, dimensiones, steps, CFG, seed, toggles, etc.). No guardan prompts.

## Mejora de prompts con IA

La aplicación puede mejorar prompts usando la API de Google Gemini/Gemma.

1. Pulsar el icono de configuración de Gemini en el header
2. Introducir una API Key de Google AI Studio (gratuita en https://aistudio.google.com/apikey)
3. Seleccionar modelo: Gemma 4, Gemini 3.1 Flash Lite o Gemini 3.5 Flash
4. Escribir un prompt básico y pulsar el icono de sparkles junto al textarea

La llamada se hace desde el servidor de Tauri. La lista de modelos se descarga de GitHub y se usa una copia local como fallback.

## Notificaciones

El icono de campana en el header activa/desactiva las notificaciones de escritorio al terminar generaciones o upscales.
