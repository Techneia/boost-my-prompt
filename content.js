let activeConfigs = [];
let isExtensionEnabled = true;

const DEFAULT_SITE_CONFIGS = {
    'chatgpt.com': [
        {
            inputSelector: '#prompt-textarea',
            buttonContainerSelector: '[data-testid="send-button"]'
        }
    ]
};

chrome.storage.local.get({ savedSites: {}, enabled: true }, (items) => {
    isExtensionEnabled = items.enabled;
    let configData = items.savedSites[window.location.hostname];
    
    // Fallback a configuración integrada de fábrica si el usuario no tiene reglas manuales aquí
    if (!configData || (Array.isArray(configData) && configData.length === 0)) {
        configData = DEFAULT_SITE_CONFIGS[window.location.hostname] || null;
    }

    if (configData) {
        if (Array.isArray(configData)) {
            activeConfigs = configData;
        } else if (typeof configData === 'string') {
            activeConfigs = [{ inputSelector: configData, buttonContainerSelector: null }];
        } else {
            activeConfigs = [configData];
        }
    }
});

/* ========== UNIVERSAL PICKER LOGIC ========== */
let pickerActive = false;
let currentHighlighted = null;
let pickerStep = 1;
let tempInputSelector = null;

function getCssSelector(el) {
    if (el.tagName.toLowerCase() == "html") return "html";
    let str = el.tagName.toLowerCase();
    
    // Prefer static stable attributes for SPA robustness
    const robustAttrs = ['data-testid', 'aria-label', 'name', 'placeholder'];
    for (let attr of robustAttrs) {
        if (el.hasAttribute(attr)) {
            const val = el.getAttribute(attr);
            if (val && !val.match(/^\d+$/)) { // Evitar solo números
                return `${str}[${attr}="${CSS.escape(val)}"]`;
            }
        }
    }

    if (el.id && !el.id.match(/\d+/)) { 
        return str + "#" + CSS.escape(el.id); 
    }
    
    let classes = Array.from(el.classList).filter(c => !c.startsWith('boost-my-prompt'));
    if (classes.length > 0) {
        str += "." + classes.map(c => CSS.escape(c)).join(".");
    }
    
    let parent = el.parentNode;
    if (parent && parent.tagName && parent.tagName.toLowerCase() !== 'body') {
        str = getCssSelector(parent) + ' > ' + str;
    }
    return str;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_PICKER_MODE') {
        startPickerMode();
    }
});

function startPickerMode() {
    pickerActive = true;
    pickerStep = 1;
    tempInputSelector = null;
    document.addEventListener('mouseover', highlightElement, true);
    document.addEventListener('mouseout', removeHighlight, true);
    document.addEventListener('click', selectElement, true);
    document.addEventListener('keydown', handlePickerKeydown, true);
    showToast('Wand Setup (Step 1/2): Click the Text Input area used for prompting. (Press ESC to cancel)', 5000);
}

function stopPickerMode() {
    pickerActive = false;
    document.removeEventListener('mouseover', highlightElement, true);
    document.removeEventListener('mouseout', removeHighlight, true);
    document.removeEventListener('click', selectElement, true);
    document.removeEventListener('keydown', handlePickerKeydown, true);
    if (currentHighlighted) {
        currentHighlighted.classList.remove('boost-my-prompt-picker-highlight');
        currentHighlighted = null;
    }
}

function handlePickerKeydown(e) {
    if (!pickerActive) return;
    if (e.key === 'Escape') {
        stopPickerMode();
        showToast('Wand Setup cancelled.');
    }
}

function highlightElement(e) {
    if (!pickerActive) return;
    if (currentHighlighted) {
        currentHighlighted.classList.remove('boost-my-prompt-picker-highlight');
    }
    currentHighlighted = e.target;
    currentHighlighted.classList.add('boost-my-prompt-picker-highlight');
}

function removeHighlight(e) {
    if (!pickerActive) return;
    if (e.target) {
        e.target.classList.remove('boost-my-prompt-picker-highlight');
    }
}

function selectElement(e) {
    if (!pickerActive) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (pickerStep === 1) {
        tempInputSelector = getCssSelector(e.target);
        pickerStep = 2;
        removeHighlight(e);
        showToast('Wand Setup (Step 2/2): Now, click the action buttons container where the Wand should be placed.', 8000);
        return;
    }

    if (pickerStep === 2) {
        const btnSelector = getCssSelector(e.target);
        stopPickerMode();
        
        const hostname = window.location.hostname;
        chrome.storage.local.get({ savedSites: {} }, (items) => {
            const savedSites = items.savedSites;
            
            let existing = savedSites[hostname];
            if (!Array.isArray(existing)) {
                if (typeof existing === 'string') {
                    existing = [{ inputSelector: existing, buttonContainerSelector: null }];
                } else if (existing && typeof existing === 'object') {
                    existing = [existing];
                } else {
                    existing = [];
                }
            }
            
            const newConfig = {
                inputSelector: tempInputSelector,
                buttonContainerSelector: btnSelector
            };
            
            // Avoid extreme duplicates
            const isDuplicate = existing.some(c => c.inputSelector === tempInputSelector && c.buttonContainerSelector === btnSelector);
            if (!isDuplicate) {
                existing.push(newConfig);
            }

            savedSites[hostname] = existing;
            
            chrome.storage.local.set({ savedSites }, () => {
                 showToast(`Wand configured perfectly for ${hostname}! ✨ (${existing.length} rules active)`);
                 activeConfigs = existing;
                 injectWand(); // Try to inject immediately
            });
        });
    }
}

function showToast(msg, ms = 4000) {
    // Remove existing toasts
    document.querySelectorAll('.boost-my-prompt-toast').forEach(t => t.remove());

    let t = document.createElement('div');
    t.className = 'boost-my-prompt-toast';
    t.textContent = msg;
    t.style.position = 'fixed'; t.style.bottom = '20px'; t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.background = '#7c3aed'; t.style.color = '#fff';
    t.style.padding = '12px 24px'; t.style.borderRadius = '8px';
    t.style.zIndex = '2147483647'; t.style.fontWeight = '500'; t.style.fontFamily = 'sans-serif';
    t.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
}

let currentWandWrapper = null;
let currentWandButton = null;

// --- Progress state ---
let progressInterval = null;
let currentProgress = 0;
let progressStartTime = 0;
let ringFg = null;
let pctLabel = null;
let progressRingSvg = null;

const RING_CIRCUMFERENCE = 2 * Math.PI * 15; // radius = 15

const WAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wand-2"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>`;

// ========== Progress Ring Helpers ==========

/**
 * Inverted progress curve (ease-in): starts slow, accelerates over time.
 * Designed for long waits (local models can take up to ~5 min).
 *
 * Timeline:
 *   0-2s   →  0% to 2%   (quick tick so ring visibly starts)
 *   ~30s   →  ~3%
 *   ~60s   →  ~6%         (slow, but clearly moving)
 *   ~120s  →  ~17%        (picking up speed)
 *   ~180s  →  ~35%        (accelerating noticeably)
 *   ~240s  →  ~61%        (fast now)
 *   ~300s  →  ~95%        (almost full, never hits 100)
 *
 * For fast API calls (2-5s), it shows ~2% then snaps to 100%.
 */
function getSimulatedProgress(elapsedMs) {
    const s = elapsedMs / 1000;

    // Quick initial tick so the ring visibly appears (0 → 2% in 2s)
    if (s <= 2) {
        return 2 * (s / 2);
    }

    // Ease-in quadratic: starts slow, continuously accelerates
    // Horizon of ~5 minutes (300s)
    const maxTime = 300;
    const t = Math.min((s - 2) / (maxTime - 2), 1);
    return 2 + 93 * t * t;
}

function setRingProgress(percent) {
    if (!ringFg || !pctLabel) return;
    const offset = RING_CIRCUMFERENCE * (1 - percent / 100);
    ringFg.style.strokeDashoffset = offset;
    pctLabel.textContent = `${Math.round(percent)}%`;
}

function startProgress() {
    currentProgress = 0;
    progressStartTime = Date.now();

    if (progressRingSvg) {
        progressRingSvg.classList.add('active');
        progressRingSvg.classList.remove('complete');
    }
    if (pctLabel) pctLabel.classList.add('active');

    setRingProgress(0);

    progressInterval = setInterval(() => {
        const elapsed = Date.now() - progressStartTime;
        currentProgress = getSimulatedProgress(elapsed);
        setRingProgress(currentProgress);
    }, 80); // update ~12 times/sec for smoothness
}

function completeProgress(callback) {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }

    // Animate to 100%
    setRingProgress(100);
    if (progressRingSvg) {
        progressRingSvg.classList.add('complete');
    }

    // After the completion animation, hide ring + label
    setTimeout(() => {
        if (progressRingSvg) {
            progressRingSvg.classList.remove('active', 'complete');
        }
        if (pctLabel) pctLabel.classList.remove('active');
        setRingProgress(0); // reset for next use
        if (callback) callback();
    }, 900);
}

function cancelProgress() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    if (progressRingSvg) {
        progressRingSvg.classList.remove('active', 'complete');
    }
    if (pctLabel) pctLabel.classList.remove('active');
    setRingProgress(0);
}

// ========== Button Creation ==========

function createWandButton() {
    if (currentWandWrapper) return currentWandWrapper;

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'boost-my-prompt-wand-wrapper';

    // SVG Progress Ring
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('boost-my-prompt-progress-ring');
    svg.setAttribute('width', '36');
    svg.setAttribute('height', '36');
    svg.setAttribute('viewBox', '0 0 36 36');

    // Gradient definition
    const defs = document.createElementNS(svgNS, 'defs');
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.id = 'boost-progress-gradient';
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '0%');

    const stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#c084fc'); // light purple
    const stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#7c3aed'); // deeper purple

    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Background track
    const bgCircle = document.createElementNS(svgNS, 'circle');
    bgCircle.classList.add('ring-bg');
    bgCircle.setAttribute('cx', '18');
    bgCircle.setAttribute('cy', '18');
    bgCircle.setAttribute('r', '15');
    svg.appendChild(bgCircle);

    // Foreground progress arc
    const fgCircle = document.createElementNS(svgNS, 'circle');
    fgCircle.classList.add('ring-fg');
    fgCircle.setAttribute('cx', '18');
    fgCircle.setAttribute('cy', '18');
    fgCircle.setAttribute('r', '15');
    svg.appendChild(fgCircle);

    progressRingSvg = svg;
    ringFg = fgCircle;

    // Percentage label
    const label = document.createElement('span');
    label.className = 'boost-my-prompt-pct-label';
    label.textContent = '0%';
    pctLabel = label;

    // The button itself
    const btn = document.createElement('button');
    btn.className = 'boost-my-prompt-wand-btn';
    btn.innerHTML = WAND_ICON;
    btn.title = 'Boost your prompt ✨';
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleWandClick();
    });

    currentWandButton = btn;

    wrapper.appendChild(svg);
    wrapper.appendChild(btn);
    wrapper.appendChild(label);

    currentWandWrapper = wrapper;
    return wrapper;
}

// ========== Input Helpers ==========

function findActualInput(element) {
    if (!element) return null;
    
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        return element;
    }

    // Queremos encontrar la RAÍZ del contenteditable (por si seleccionó un párrafo interno <p> o <span>)
    const rootCE = element.closest('[contenteditable], textarea, input');
    if (rootCE) return rootCE;

    // Buscamos hacia abajo (por si hizo clic en un div contenedor gigante)
    const innerCE = element.querySelector('[contenteditable], textarea, input[type="text"]');
    if (innerCE) return innerCE;

    if (element.isContentEditable) return element;

    return element; // Fallback
}

function getTextFromInput(baseElement) {
    const element = findActualInput(baseElement);
    if (!element) return '';
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        return element.value;
    } else if (element.isContentEditable || element.hasAttribute('contenteditable')) {
        return element.innerText || element.textContent;
    }
    return '';
}

function setTextToInput(baseElement, text) {
    const element = findActualInput(baseElement);
    if (!element) return;
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        element.value = '';
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.isContentEditable || element.hasAttribute('contenteditable')) {
        element.focus();

        // 1. Seleccionamos el contenido internamente de forma explícita
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);

        // 2. Ejecutamos un "Delete" nativo. 
        // Esto obliga a ProseMirror (ChatGPT) y React a borrar su estado interno de texto.
        document.execCommand('delete', false, null);

        // 3. Insertamos el nuevo texto limpio
        document.execCommand('insertText', false, text);
        
        // Despachamos evento genérico por si algún framework secundario lo requiere
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

// ========== Main Handler ==========

async function handleWandClick() {
    if (activeConfigs.length === 0) return;

    let rawInputArea = null;
    for (const config of activeConfigs) {
        try {
            rawInputArea = getVisibleElement(config.inputSelector);
            if (rawInputArea) break;
        } catch(e) {}
    }

    if (!rawInputArea) {
        showToast("Error: No se encontró la caja de texto. Trata de reconfigurar la varita.", 4000);
        return;
    }
    
    let inputArea = findActualInput(rawInputArea);

    let textToImprove = '';
    if (inputArea) {
        textToImprove = getTextFromInput(inputArea);
    }

    // Fallback maestro: si el selector no capturó texto, escaneamos TODA la página
    // buscando cualquier input o contenteditable que tenga texto escrito.
    if (!textToImprove || !textToImprove.trim()) {
        const fallbacks = document.querySelectorAll('textarea, [contenteditable], input[type="text"]');
        for (let el of fallbacks) {
            let txt = '';
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                txt = el.value;
            } else {
                txt = el.innerText || el.textContent;
            }
            
            if (txt && txt.trim()) {
                inputArea = el; // Reasignamos la caja de texto al elemento correcto
                textToImprove = txt;
                break;
            }
        }
    }

    if (!textToImprove || !textToImprove.trim()) {
        showToast("Escribe algo en la caja de texto primero ✍️", 4000);
        return;
    }

    // Start loading + progress
    if (currentWandWrapper) currentWandWrapper.classList.add('loading');
    startProgress();

    try {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            cancelProgress();
            if (currentWandWrapper) currentWandWrapper.classList.remove('loading');
            alert('Boost my prompT was updated. Please refresh THIS page to use the new version.');
            return;
        }

        chrome.runtime.sendMessage({ action: 'boostPrompt', text: textToImprove }, (response) => {
            if (chrome.runtime.lastError) {
                cancelProgress();
                if (currentWandWrapper) currentWandWrapper.classList.remove('loading');
                console.error("Extension runtime error:", chrome.runtime.lastError);
                if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                    alert('Boost my prompT was updated. Please refresh THIS page to use the new version.');
                } else {
                    alert(`Boost my prompT error: ${chrome.runtime.lastError.message}`);
                }
                return;
            }

            if (response && response.error) {
                cancelProgress();
                if (currentWandWrapper) currentWandWrapper.classList.remove('loading');
                alert(`Boost my prompT error: ${response.error}`);
                return;
            }

            if (response && response.success && response.improvedText) {
                // Complete progress animation, then set text
                completeProgress(() => {
                    if (currentWandWrapper) currentWandWrapper.classList.remove('loading');
                    setTextToInput(inputArea, response.improvedText);
                });
            } else {
                cancelProgress();
                if (currentWandWrapper) currentWandWrapper.classList.remove('loading');
            }
        });
    } catch (err) {
        cancelProgress();
        if (currentWandWrapper) currentWandWrapper.classList.remove('loading');
        if (err.message && err.message.includes('Extension context invalidated')) {
            alert('Boost my prompT was updated. Please refresh THIS page to use the new version.');
        } else {
            console.error("Wand click error:", err);
            alert(`Boost my prompT error: ${err.message}`);
        }
    }
}

// ========== Injection ==========

function getVisibleElement(selector) {
    try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            const rect = el.getBoundingClientRect();
            // Verifica que tenga tamaño real en pantalla
            if (rect.width > 0 && rect.height > 0) {
                return el;
            }
        }
    } catch (e) {
        throw e; // re-lanzar para que lo agarre el catch superior y limpie el storage si el selector es inválido
    }
    return null;
}

function injectWand(retryCount = 0) {
    try {
        if (!isExtensionEnabled) {
            if (currentWandWrapper && currentWandWrapper.parentElement) {
                currentWandWrapper.parentElement.removeChild(currentWandWrapper);
                currentWandWrapper = null;
                currentWandButton = null;
            }
            return;
        }

        if (activeConfigs.length === 0) return;

        let inputArea = null;
        let activeConfig = null;
        
        for (let i = 0; i < activeConfigs.length; i++) {
            const config = activeConfigs[i];
            try {
                // Buscamos SOLO el área que esté visible en la pantalla
                inputArea = getVisibleElement(config.inputSelector);
                if (inputArea) {
                    activeConfig = config;
                    break;
                }
            } catch (queryErr) {
                // Eliminamos config corruptos silenciosamente
                activeConfigs.splice(i, 1);
                i--;
            }
        }
        
        // Sync corrupt trimmers back to storage
        if (activeConfigs.length === 0) {
             // Limpia storage si todo es inválido
             chrome.storage.local.get({ savedSites: {} }, (items) => {
                const savedSites = items.savedSites;
                delete savedSites[window.location.hostname];
                chrome.storage.local.set({ savedSites });
             });
             return;
        }
        
        if (!inputArea) return;

        let buttonContainer = null;
        if (activeConfig.buttonContainerSelector) {
            try {
                buttonContainer = getVisibleElement(activeConfig.buttonContainerSelector);
            } catch (err) {}
            
            // Si hay un contenedor esperado pero no se encuentra aún en el DOM (SPA rendering delay)
            if (!buttonContainer && retryCount < 5) {
                setTimeout(() => injectWand(retryCount + 1), 200);
                return;
            }
        }

        const currentWrapperInDOM = document.querySelector('.boost-my-prompt-wand-wrapper');

        const wandEl = createWandButton();
        if (buttonContainer) {
            // Si ya está inyectado pero en el contenedor INCORRECTO (por ejemplo, el de la pantalla Home oculta), lo movemos
            if (!currentWrapperInDOM || currentWrapperInDOM.parentElement !== buttonContainer) {
                wandEl.style.position = 'relative';
                wandEl.style.top = 'auto';
                wandEl.style.left = 'auto';
                wandEl.style.zIndex = '1';
                wandEl.style.display = 'inline-flex';
                buttonContainer.appendChild(wandEl);
            }
        } else {
            // Modo Fixed (cuando no hay botón configurado)
            if (!currentWrapperInDOM) {
                wandEl.style.position = 'fixed';
                wandEl.style.zIndex = '2147483646';
                document.body.appendChild(wandEl);
            }
            positionWand(wandEl, inputArea);
        }
    } catch (e) {
        console.error("injectWand error:", e);
    }
}

function positionWand(wandEl, inputEl) {
    if (!wandEl || !inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        return; // No lo ocultes, simplemente no actualices la posición (SPAs rendering glitches)
    }
    wandEl.style.display = 'inline-flex';
    wandEl.style.top = `${rect.bottom - 46}px`;
    wandEl.style.left = `${rect.right - 46}px`;
}

// Adjust on scroll and resize only if the wand is floating
window.addEventListener('resize', () => {
    if (activeConfigs.length > 0 && currentWandWrapper && currentWandWrapper.style.position === 'fixed') {
        const inputArea = getVisibleElement(activeConfigs[0].inputSelector); // simplification
        if (inputArea) positionWand(currentWandWrapper, inputArea);
    }
});
document.addEventListener('scroll', () => {
    if (activeConfigs.length > 0 && currentWandWrapper && currentWandWrapper.style.position === 'fixed') {
        const inputArea = getVisibleElement(activeConfigs[0].inputSelector);
        if (inputArea) positionWand(currentWandWrapper, inputArea);
    }
}, true);

// Observe DOM for the text area appearing (e.g., SPAs like ChatGPT)
let injectTimeout = null;
const observer = new MutationObserver((mutations) => {
    if (injectTimeout) clearTimeout(injectTimeout);
    injectTimeout = setTimeout(() => {
        injectWand();
    }, 250); // Debounce de 250ms para asegurar que React termine de procesar el DOM nuevo
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen for settings changes to re-evaluate injection
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.enabled !== undefined) {
            isExtensionEnabled = changes.enabled.newValue;
        }
        if (changes.savedSites !== undefined) {
            let configData = changes.savedSites.newValue[window.location.hostname];
            if (!configData || (Array.isArray(configData) && configData.length === 0)) {
                configData = DEFAULT_SITE_CONFIGS[window.location.hostname] || null;
            }
            if (configData) {
                if (Array.isArray(configData)) {
                    activeConfigs = configData;
                } else if (typeof configData === 'string') {
                    activeConfigs = [{ inputSelector: configData, buttonContainerSelector: null }];
                } else {
                    activeConfigs = [configData];
                }
            } else {
                activeConfigs = [];
                if (currentWandWrapper && currentWandWrapper.parentElement) {
                    currentWandWrapper.parentElement.removeChild(currentWandWrapper);
                    currentWandWrapper = null;
                    currentWandButton = null;
                }
            }
        }
        injectWand();
    }
});
