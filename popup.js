document.addEventListener('DOMContentLoaded', () => {
    const toggleInput = document.getElementById('extension-toggle');
    const providerSelect = document.getElementById('provider');
    const apiKeyGroup = document.getElementById('api-key-group');
    const apiKeyInput = document.getElementById('api-key');
    const ollamaUrlGroup = document.getElementById('ollama-url-group');
    const ollamaUrlInput = document.getElementById('ollama-url');
    const ollamaModelGroup = document.getElementById('ollama-model-group');
    const ollamaModelSelect = document.getElementById('ollama-model');
    const fetchModelsBtn = document.getElementById('fetch-ollama-models-btn');
    const ollamaFetchStatus = document.getElementById('ollama-fetch-status');
    const modelSearchInput = document.getElementById('model-search');
    const saveBtn = document.getElementById('save-btn');
    const statusDiv = document.getElementById('status');

    let currentApiKeys = {};
    let currentProviderUrls = {};
    let currentProviderModels = {};
    let allModels = [];

    // Load saved options
    chrome.storage.local.get(
        {
            enabled: true,
            provider: 'openai',
            apiKeys: {},
            providerUrls: { 'ollama-local': 'http://localhost:11434' },
            providerModels: {}
        },
        (items) => {
            currentApiKeys = items.apiKeys || {};
            currentProviderUrls = items.providerUrls || { 'ollama-local': 'http://localhost:11434' };
            currentProviderModels = items.providerModels || {};

            toggleInput.checked = items.enabled;
            providerSelect.value = items.provider;

            const provider = items.provider;
            apiKeyInput.value = currentApiKeys[provider] || '';
            ollamaUrlInput.value = currentProviderUrls[provider] || '';

            const savedModel = currentProviderModels[provider] || '';
            if (savedModel) {
                const opt = document.createElement('option');
                opt.value = savedModel;
                opt.textContent = savedModel;
                ollamaModelSelect.appendChild(opt);
                ollamaModelSelect.value = savedModel;
            }

            updateUIForProvider();
        }
    );

    // Update UI when provider changes
    providerSelect.addEventListener('change', () => {
        const provider = providerSelect.value;
        // Preset default URL when switching to local if it's currently empty or remote
        if (provider === 'ollama-local' && !currentProviderUrls['ollama-local']) {
            currentProviderUrls['ollama-local'] = 'http://localhost:11434';
        }

        apiKeyInput.value = currentApiKeys[provider] || '';
        ollamaUrlInput.value = currentProviderUrls[provider] || '';
        modelSearchInput.value = '';
        allModels = [];

        ollamaModelSelect.innerHTML = '<option value="">Select a model...</option>';
        const savedModel = currentProviderModels[provider] || '';
        if (savedModel) {
            const opt = document.createElement('option');
            opt.value = savedModel;
            opt.textContent = savedModel;
            ollamaModelSelect.appendChild(opt);
            ollamaModelSelect.value = savedModel;
        }

        updateUIForProvider();
    });

    function updateUIForProvider() {
        const provider = providerSelect.value;
        apiKeyGroup.style.display = 'flex';
        ollamaModelGroup.style.display = 'flex';

        if (provider === 'ollama-local' || provider === 'ollama-remote') {
            ollamaUrlGroup.style.display = 'flex';
        } else {
            ollamaUrlGroup.style.display = 'none';
        }
    }

    // Fetch Models
    fetchModelsBtn.addEventListener('click', async () => {
        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();

        let endpoint = '';
        let headers = {
            'Authorization': `Bearer ${apiKey}`
        };

        if (provider === 'openai') {
            if (!apiKey) return ollamaFetchStatus.textContent = 'API Key required.';
            endpoint = 'https://api.openai.com/v1/models';
        } else if (provider === 'inception') {
            if (!apiKey) return ollamaFetchStatus.textContent = 'API Key required.';
            endpoint = 'https://api.inceptionlabs.ai/v1/models';
        } else if (provider === 'openrouter') {
            if (!apiKey) return ollamaFetchStatus.textContent = 'API Key required.';
            endpoint = 'https://openrouter.ai/api/v1/models';
        } else if (provider === 'gemini') {
            if (!apiKey) return ollamaFetchStatus.textContent = 'API Key required.';
            // Gemini doesn't have a standard /models endpoint with Bearer auth easily callable from client
            // We'll mock the most common ones for UI purposes if actual fetching isn't supported smoothly
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            delete headers['Authorization']; // Gemini uses query param
        } else if (provider === 'anthropic') {
            if (!apiKey) return ollamaFetchStatus.textContent = 'API Key required.';
            // Anthropic doesn't have a standard /models endpoint. Mocking common ones.
            const anthropicModels = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
            allModels = [...anthropicModels];
            ollamaModelSelect.innerHTML = '<option value="">Select a model...</option>';
            anthropicModels.forEach(m => {
                const opt = document.createElement('option');
                opt.value = opt.textContent = m;
                ollamaModelSelect.appendChild(opt);
            });
            return ollamaFetchStatus.textContent = 'Loaded common Anthropic models.';
        } else if (provider === 'ollama-local' || provider === 'ollama-remote') {
            let baseUrl = ollamaUrlInput.value.trim();
            if (!baseUrl) return ollamaFetchStatus.textContent = 'Ollama URL required.';
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const isV1 = baseUrl.endsWith('/v1');
            endpoint = isV1 ? `${baseUrl}/models` : `${baseUrl}/api/tags`;
        }

        ollamaFetchStatus.textContent = 'Fetching models...';
        fetchModelsBtn.disabled = true;

        try {
            const response = await fetch(endpoint, {
                headers,
                mode: 'cors',
                credentials: 'omit'
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            const previousModel = ollamaModelSelect.value;
            ollamaModelSelect.innerHTML = '<option value="">Select a model...</option>';

            let modelsArray = [];

            if (provider === 'gemini') {
                modelsArray = (data.models || [])
                    .filter(m =>
                        m.supportedGenerationMethods &&
                        m.supportedGenerationMethods.includes('generateContent') &&
                        !m.name.toLowerCase().includes('vision') &&
                        !m.name.toLowerCase().includes('embedding') &&
                        !m.name.toLowerCase().includes('aqa') &&
                        !m.name.toLowerCase().includes('image') &&
                        !m.name.toLowerCase().includes('tts') &&
                        !m.name.toLowerCase().includes('audio') &&
                        !m.name.toLowerCase().includes('video')
                    )
                    .map(m => m.name.replace('models/', ''));
            } else if (provider.startsWith('ollama') && !endpoint.includes('/v1/models')) {
                modelsArray = (data.models || []).map(m => m.name);
            } else {
                // OpenAI, Inception, OpenRouter, Ollama /v1
                modelsArray = (data.data || []).map(m => m.id);
            }

            if (modelsArray.length > 0) {
                allModels = [...modelsArray];
                modelsArray.forEach(modelId => {
                    const opt = document.createElement('option');
                    opt.value = modelId;
                    opt.textContent = modelId;
                    ollamaModelSelect.appendChild(opt);
                });
                ollamaFetchStatus.textContent = `Found ${modelsArray.length} models.`;
            } else {
                ollamaFetchStatus.textContent = 'No models found.';
            }

            if (previousModel && [...ollamaModelSelect.options].some(opt => opt.value === previousModel)) {
                ollamaModelSelect.value = previousModel;
            }

            saveSettings(); // auto-save the newly loaded or retained model
        } catch (e) {
            ollamaFetchStatus.textContent = `Error: ${e.message}`;
            console.error('Fetch models error:', e);
        } finally {
            fetchModelsBtn.disabled = false;
        }
    });

    // Save options functionality
    const saveSettings = () => {
        const enabled = toggleInput.checked;
        const provider = providerSelect.value;

        currentApiKeys[provider] = apiKeyInput.value.trim();

        let urlClean = ollamaUrlInput.value.trim();
        if (urlClean && urlClean.endsWith('/')) {
            urlClean = urlClean.slice(0, -1);
        }
        currentProviderUrls[provider] = urlClean;
        currentProviderModels[provider] = ollamaModelSelect.value;

        chrome.storage.local.set(
            {
                enabled: enabled,
                provider: provider,
                apiKeys: currentApiKeys,
                providerUrls: currentProviderUrls,
                providerModels: currentProviderModels
            },
            () => {
                statusDiv.textContent = 'Settings saved!';
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 2000);
            }
        );
    };

    saveBtn.addEventListener('click', saveSettings);

    // Auto-save on any change
    [toggleInput, providerSelect, apiKeyInput, ollamaUrlInput, ollamaModelSelect].forEach(input => {
        input.addEventListener('change', saveSettings);
        if (input.type === 'text' || input.tagName === 'TEXTAREA') {
            input.addEventListener('input', saveSettings);
        }
    });

    // Model search filter
    modelSearchInput.addEventListener('input', () => {
        const searchTerm = modelSearchInput.value.toLowerCase().trim();
        
        ollamaModelSelect.innerHTML = '<option value="">Select a model...</option>';
        
        const filteredModels = allModels.filter(model => 
            model.toLowerCase().includes(searchTerm)
        );
        
        filteredModels.forEach(modelId => {
            const opt = document.createElement('option');
            opt.value = modelId;
            opt.textContent = modelId;
            ollamaModelSelect.appendChild(opt);
        });
        
        if (allModels.length > 0 && filteredModels.length === 0) {
            ollamaFetchStatus.textContent = 'No models match your search.';
        } else if (filteredModels.length > 0) {
            ollamaFetchStatus.textContent = `${filteredModels.length} model(s) found.`;
        }
    });
});
