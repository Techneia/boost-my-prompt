# Lógica de Compresión "Dense Spanish" (T9Caveman)

Este documento contiene la lógica exacta, los diccionarios y el pseudocódigo necesarios para portar el sistema de compresión extrema de tokens a cualquier otro lenguaje (Python, C#, Go, etc.) o para usarlo como System Prompt.

## 1. Diccionarios Requeridos

Para lograr la compresión, necesitas implementar tres diccionarios/sets de datos en tu sistema objetivo.

### A. Set de Stopwords (Palabras a eliminar 100%)
Esta es una lista agresiva. Si una palabra está aquí, **desaparece**.

```json
[
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "al", "del",
  "a", "ante", "bajo", "cabe", "con", "contra", "de", "desde", "durante", "en", "entre", "hacia", "hasta", "mediante", "para", "por", "segun", "sin", "so", "sobre", "tras", "versus", "via",
  "y", "e", "ni", "o", "u", "pero", "aunque", "mas", "sino", "porque", "pues", "si", "como", "entonces", "ademas", "tambien", "tampoco", "incluso", "asi",
  "que", "quien", "cual", "cuales", "quienes", "me", "te", "se", "nos", "os", "le", "les", "mi", "tu", "su", "mis", "tus", "sus", "esto", "esta", "estos", "estas", "eso", "esa", "esos", "esas", "aquel", "aquella",
  "es", "son", "ser", "sea", "sean", "esta", "estan", "estar", "estoy", "estas", "ha", "han", "he", "has", "haber", "hacer", "hace", "hacen", "tener", "tiene", "tienen", "tengo", "puede", "pueden", "pueda", "puedan", "puedo", "poder", "debe", "deben", "debo", "quiero", "quiere", "quieren", "querer", "van", "va", "vamos", "voy", "ir", "puedes", "tienes",
  "muy", "mucho", "muchos", "mucha", "muchas", "poco", "pocos", "bastante", "demasiado", "solo", "solamente", "realmente", "basicamente", "luego", "despues", "antes", "ahora", "ya", "aqui", "alli", "alla", "donde", "cuando", "mientras", "siempre", "nunca", "jamas", "casi", "tal", "vez",
  "completo", "completa", "posible", "posibles", "propuesta", "definicion", "ejemplo", "favor"
]
```

### B. Diccionario de Frases (Reemplazo multi-palabra)
Se debe buscar la frase completa (sin importar mayúsculas/minúsculas) y sustituirla.

```json
{
  "por favor": "",
  "aplicacion movil": "app",
  "redes sociales": "redes",
  "base de datos": "bd",
  "inteligencia artificial": "ia",
  "paso a paso": "paso/paso",
  "modelo de negocio": "modelo negocio"
}
```

### C. Diccionario de Abreviaturas (Reemplazo palabra por palabra)
Transformaciones semánticas súper cortas.

```json
{
  "aplicacion": "app",
  "entrega": "delivery",
  "mensaje": "msj",
  "desarrollo": "dev",
  "informacion": "info",
  "configuracion": "config",
  "tecnologia": "tech",
  "marketing": "mkt",
  "profesional": "pro"
}
```

---

## 2. Algoritmo Paso a Paso (Pseudocódigo)

El proceso de transformación debe seguir **exactamente** este orden para no romper el contexto ni los signos de puntuación:

1. **Recibir el texto original** (`text`).
2. **Eliminar acentos y diacríticos:** Convertir caracteres como `á, é, í, ó, ú, ü` a `a, e, i, o, u`. Esto facilita el matcheo y ahorra tokens en algunos LLMs.
3. **Reemplazo de Frases Multi-palabra:** Iterar sobre el diccionario **B** y reemplazar las ocurrencias exactas (ignorando case) en el texto.
4. **Tokenización no destructiva:** Separar el texto en "palabras" y "no-palabras" (espacios, saltos de línea, comas, puntos, emojis). *Debes conservar los separadores intactos en una lista o arreglo.*
5. **Iteración de limpieza por palabra:**
   - Para cada elemento:
     - Si es un "separador" (espacios, puntuación), dejarlo igual.
     - Si es una "palabra":
       - Convertir temporalmente la palabra a **minúsculas** (`lowerWord`) para hacer comprobaciones.
       - Si `lowerWord` existe en el set de **Stopwords (A)** -> Retornar string vacío `""` (Eliminar).
       - Si `lowerWord` existe en el diccionario de **Abreviaturas (C)** -> Retornar el valor abreviado.
       - Si no cumple ninguna de las anteriores -> Retornar la palabra original (manteniendo sus mayúsculas originales si las tenía).
6. **Reconstrucción:** Unir todos los elementos procesados de nuevo en un solo string.
7. **Limpieza final:** Reemplazar los dobles o múltiples espacios generados por las palabras eliminadas por un solo espacio (`"  " -> " "`).

---

## 3. Implementación de Referencia (Python)

Si planeas implementar esto en un backend en Python, aquí tienes la función equivalente directa:

```python
import re
import unicodedata

# 1. Copia aquí tus diccionarios STOPWORDS, PHRASES y WORDS_DICT
STOPWORDS = set(["el", "la", "los", "las", "un", "una", ...]) # Agregar todos
PHRASES = {"por favor": "", "aplicacion movil": "app", ...}
WORDS_DICT = {"aplicacion": "app", "entrega": "delivery", ...}

def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFD', input_str)
    return u"".join([c for c in nfkd_form if not unicodedata.combining(c)])

def compress_tokens(text: str) -> str:
    if not text or not text.strip():
        return ""
        
    # 1. Eliminar acentos
    result = remove_accents(text)
    
    # 2. Reemplazo de frases
    for phrase, replacement in PHRASES.items():
        # Usamos \b para asegurar que sean palabras completas e ignoramos case
        result = re.sub(rf'\b{phrase}\b', replacement, result, flags=re.IGNORECASE)
        
    # 3. Tokenización manteniendo separadores
    # re.split capturando el grupo mantiene los separadores en la lista
    parts = re.split(r'([a-zA-Z]+)', result)
    
    transformed_parts = []
    
    for i, part in enumerate(parts):
        # Índices pares son separadores, impares son palabras
        if i % 2 == 0:
            transformed_parts.append(part)
            continue
            
        lower_word = part.lower()
        
        # Eliminar stopwords
        if lower_word in STOPWORDS:
            transformed_parts.append("")
            continue
            
        # Reemplazar abreviaturas
        if lower_word in WORDS_DICT:
            transformed_parts.append(WORDS_DICT[lower_word])
            continue
            
        # Mantener palabra original
        transformed_parts.append(part)
        
    # Reconstrucción
    final_result = "".join(transformed_parts)
    
    # Limpieza de espacios dobles
    final_result = re.sub(r' {2,}', ' ', final_result)
    final_result = re.sub(r'\n {1,}', '\n', final_result)
    
    return final_result.strip()
```
