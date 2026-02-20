import textToSpeech from '@google-cloud/text-to-speech';

let credentials;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    }
} catch (e) {
    console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON', e);
}

const client = new textToSpeech.TextToSpeechClient(credentials ? { credentials } : undefined);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { text } = req.body || {};
    if (!text) {
        res.status(400).json({ error: 'Text is required for TTS' });
        return;
    }

    try {
        const request = {
            input: { text },
            voice: { languageCode: 'ko-KR', name: 'ko-KR-Neural2-A' },
            audioConfig: { audioEncoding: 'MP3' as const },
        };

        const [response] = await client.synthesizeSpeech(request);

        // Convert Uint8Array to Base64
        const audioContent = response.audioContent as Uint8Array;
        const base64Audio = Buffer.from(audioContent).toString('base64');

        res.status(200).json({ audioContent: base64Audio });
    } catch (error) {
        console.error('TTS error:', error);
        res.status(500).json({ error: '음성 생성 중 오류가 발생했습니다.' });
    }
}
