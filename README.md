# StableDiffusionCppUI

Frontend de escritorio para [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp). Construido con Tauri 2, vanilla HTML/CSS/JavaScript y Rust.

La aplicacion no incluye ni el binario `sd-cli` ni los modelos. Estos se configuran por separado.

## Desarrollo

```bash
pnpm tauri dev
```

## Compilacion

```bash
pnpm tauri build
```

Genera el instalador en `src-tauri/target/release/bundle/`.

## Configuracion inicial

Al abrir la aplicacion, configurar las rutas en el sidebar:

- **SD-cpp**: Carpeta donde esta `sd-cli.exe`
- **Output**: Carpeta de salida de imagenes
- **Modelos**: Carpeta con los modelos (.safetensors, .ckpt, .bin, .gguf)
- **VAE, LLM Encoder, LoRA, CLIP-L, CLIP-G, T5XXL**: Carpetas con cada tipo de modelo
- **Upscalers**: Carpeta con modelos de escalado (.gguf)

## Generacion de imagenes

1. Seleccionar modelo y tipo (Diffusion o Monolithic)
2. Escribir un prompt
3. Configurar parametros (ancho, alto, steps, CFG, seed, etc.)
4. Pulsar "EJECUTAR"

La consola muestra el progreso en tiempo real. Al terminar, la imagen aparece en el area de preview.

## Upscale

### Desde la barra de acciones

Despues de generar una imagen, pulsar "Upscale" en la barra de acciones. Seleccionar modelo y pulsar "Ejecutar". La imagen escalada se guarda en `output/scaled/`.

### Desde "Imagen como input"

Abrir la seccion, seleccionar una imagen externa, marcar "Upscale", elegir modelo y ejecutar. Permite escalar sin pasar por generacion.

## Plantillas de prompts

Guardar pares de prompt + negative prompt con un nombre en la seccion "Prompts" del sidebar. Seleccionar y pulsar "Cargar" para reutilizarlos.

## Preajustes

Guardan todos los parametros de generacion (modelo, dimensiones, steps, CFG, seed, toggles, etc.). No guardan prompts.

## Mejora de prompts con IA

La aplicacion puede mejorar prompts usando la API de Google Gemini/Gemma.

1. Pulsar el icono de configuracion de Gemini en el header
2. Introducir una API Key de Google AI Studio (gratuita en https://aistudio.google.com/apikey)
3. Seleccionar modelo: Gemma 4, Gemini 3.1 Flash Lite o Gemini 3.5 Flash
4. Escribir un prompt basico y pulsar el icono de sparkles junto al textarea

La llamada se hace desde el servidor de Tauri. La lista de modelos se descarga de GitHub y se usa una copia local como fallback.

## Notificaciones

El icono de campana en el header activa/desactiva las notificaciones de escritorio al terminar generaciones o upscales.
