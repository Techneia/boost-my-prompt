// Configuration for finding the text entry area on different sites
const SITE_CONFIGS = [
    {
        host: 'chatgpt.com',
        inputSelector: '#prompt-textarea',
        buttonContainerSelector: '.flex.items-center.gap-2.\\[grid-area\\:trailing\\] > div' // Inject into the trailing tools area next to voice button
    },
    {
        host: 'gemini.google.com',
        inputSelector: 'rich-textarea .ql-editor',
        buttonContainerSelector: '.leading-actions-wrapper'
    },
    {
        host: 'claude.ai',
        inputSelector: '[contenteditable="true"].ProseMirror',
        buttonContainerSelector: '.relative.flex-1.flex.items-center.shrink.min-w-0.gap-1',
        insertPosition: 'beforeend'
    },
    {
        host: 'grok.com',
        inputSelector: '.ProseMirror',
        buttonContainerSelector: '.ms-auto.flex.flex-row.items-end.gap-1',
        wrapperStyle: { zIndex: '100' }
    },
    {
        host: 'chat.mistral.ai',
        inputSelector: '.ProseMirror',
        buttonContainerSelector: '.flex.ms-auto'
    },
    {
        host: 'lumo.proton.me',
        inputSelector: '.lumo-input-container .ProseMirror',
        buttonContainerSelector: '.lumo-input-container .flex.flex-row.flex-nowrap.items-center.gap-2.pl-1'
    },
    {
        host: 'lovable.dev',
        inputSelector: '.ProseMirror',
        buttonContainerSelector: '#chat-input .ml-auto.flex.items-center.gap-1',
        insertPosition: 'afterbegin'
    },
    {
        host: 'replit.com',
        inputSelector: '.cm-content[contenteditable="true"]',
        buttonContainerSelector: 'button[data-cy="ai-prompt-submit"]',
        insertPosition: 'beforebegin'
    },
    {
        host: 'aistudio.google.com',
        inputSelector: 'textarea.prompt-textarea',
        buttonContainerSelector: '.actions-container',
        insertPosition: 'beforeend'
    }
];

let currentWandWrapper = null;
let currentWandButton = null;
let savedOriginalText = '';
let savedImprovedText = '';
let isUndoMode = false;

// --- Progress state ---
let progressInterval = null;
let currentProgress = 0;
let progressStartTime = 0;
let ringFg = null;
let pctLabel = null;
let progressRingSvg = null;

const RING_CIRCUMFERENCE = 2 * Math.PI * 15; // radius = 15

const WAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wand-2"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>`;
const UNDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-undo-2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;

function detectSiteConfig() {
    const hostname = window.location.hostname;
    return SITE_CONFIGS.find(config => hostname.includes(config.host));
}

function resetToWand() {
    isUndoMode = false;
    if (currentWandButton) {
        currentWandButton.innerHTML = WAND_ICON;
        currentWandButton.title = 'Boost your prompt ✨';
    }
}

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

function getTextFromInput(element) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        return element.value;
    } else if (element.isContentEditable) {
        return element.innerText || element.textContent;
    }
    return '';
}

function setTextToInput(element, text) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.isContentEditable) {
        element.focus();

        // Robust selection for advanced editors (CodeMirror, ProseMirror)
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);

        // Try dispatching a paste event. Advanced editors handle this internally
        // and update their React/custom states perfectly.
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
        });

        element.dispatchEvent(pasteEvent);

        // If the editor didn't catch and prevent the paste event, 
        // fallback to the browser's native insertText command.
        if (!pasteEvent.defaultPrevented) {
            document.execCommand('insertText', false, text);
        }
    }
}

let inputListenerAdded = false;

function setupInputListener(inputArea) {
    if (inputListenerAdded) return;
    inputArea.addEventListener('input', () => {
        if (isUndoMode) {
            const currentText = getTextFromInput(inputArea);
            if (currentText.trim() !== savedImprovedText.trim()) {
                resetToWand();
            }
        }
    });
    inputListenerAdded = true;
}

// ========== Main Handler ==========

async function handleWandClick() {
    const config = detectSiteConfig();
    if (!config) return;

    const inputArea = document.querySelector(config.inputSelector);
    if (!inputArea) return;

    setupInputListener(inputArea);

    if (isUndoMode) {
        setTextToInput(inputArea, savedOriginalText);
        resetToWand();
        return;
    }

    const textToImprove = getTextFromInput(inputArea);
    if (!textToImprove.trim()) return;

    savedOriginalText = textToImprove;

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
                    savedImprovedText = response.improvedText;
                    setTextToInput(inputArea, response.improvedText);

                    // Switch to Undo mode
                    isUndoMode = true;
                    currentWandButton.innerHTML = UNDO_ICON;
                    currentWandButton.title = 'Undo prompt boost';
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

function injectWand() {
    try {
        if (!chrome.storage || !chrome.storage.local) {
            return;
        }

        chrome.storage.local.get({ enabled: true }, (items) => {
            if (chrome.runtime.lastError) {
                return;
            }

            if (!items.enabled) {
                if (currentWandWrapper && currentWandWrapper.parentElement) {
                    currentWandWrapper.parentElement.removeChild(currentWandWrapper);
                    currentWandWrapper = null;
                    currentWandButton = null;
                }
                return;
            }

            const config = detectSiteConfig();
            if (!config) return;

            // Ensure wand isn't already there
            if (document.querySelector('.boost-my-prompt-wand-wrapper')) return;

            const container = document.querySelector(config.buttonContainerSelector);
            if (container) {
                const insertPos = config.insertPosition || 'afterbegin';
                const wandEl = createWandButton();
                if (config.wrapperStyle) {
                    Object.assign(wandEl.style, config.wrapperStyle);
                }
                container.insertAdjacentElement(insertPos, wandEl);
            }
        });
    } catch (e) {
        // Silently catch context invalidated errors
    }
}

// Observe DOM for the text area appearing (e.g., SPAs like ChatGPT)
const observer = new MutationObserver((mutations) => {
    injectWand();
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen for settings changes to re-evaluate injection
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.enabled) {
        injectWand();
    }
});
