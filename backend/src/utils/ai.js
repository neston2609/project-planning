const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'azure_openai', 'custom'];

function cleanAiProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    return AI_PROVIDERS.includes(provider) ? provider : 'openai';
}

function normalizeEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const { timeout_ms, ...fetchOptions } = options;
    const timeout = setTimeout(() => controller.abort(), Number(timeout_ms || 15000));
    let response;
    try {
        response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) {
        const err = new Error(data?.error?.message || data?.error || data?.message || response.statusText || 'AI request failed');
        err.status = response.status;
        throw err;
    }
    return data;
}

async function runAiPrompt({ provider, apiKey, endpoint, model, prompt, temperature = 0.1, maxTokens = 300, timeoutMs = 20000 }) {
    const cleanProvider = cleanAiProvider(provider);
    const cleanEndpoint = normalizeEndpoint(endpoint);
    const cleanModel = String(model || '').trim();
    if (!apiKey || !cleanModel) throw new Error('AI configuration is incomplete');

    if (cleanProvider === 'openai') {
        const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: cleanModel, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens }),
            timeout_ms: timeoutMs
        });
        return data?.choices?.[0]?.message?.content || '';
    }
    if (cleanProvider === 'anthropic') {
        const data = await fetchJson('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: cleanModel, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
            timeout_ms: timeoutMs
        });
        return (data?.content || []).map(part => part.text || '').join('\n');
    }
    if (cleanProvider === 'google') {
        const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            timeout_ms: timeoutMs
        });
        return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
    }
    if (cleanProvider === 'azure_openai') {
        if (!cleanEndpoint) throw new Error('Azure endpoint is missing');
        const data = await fetchJson(`${cleanEndpoint}/openai/deployments/${encodeURIComponent(cleanModel)}/chat/completions?api-version=2024-10-21`, {
            method: 'POST',
            headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens }),
            timeout_ms: timeoutMs
        });
        return data?.choices?.[0]?.message?.content || '';
    }

    if (!cleanEndpoint) throw new Error('Custom endpoint is missing');
    const data = await fetchJson(`${cleanEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cleanModel, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens }),
        timeout_ms: timeoutMs
    });
    return data?.choices?.[0]?.message?.content || '';
}

module.exports = { cleanAiProvider, normalizeEndpoint, fetchJson, runAiPrompt };
