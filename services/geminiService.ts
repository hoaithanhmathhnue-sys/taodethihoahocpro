
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  SYSTEM_INSTRUCTION,
  MODEL_NAME,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_AGENT_PLATFORM_MODEL,
  GEMINI_MODEL_STORAGE_KEY,
  LEGACY_GEMINI_MODEL_STORAGE_KEYS,
  GEMINI_MODELS,
  AGENT_PLATFORM_MODELS,
  PROVIDER_FALLBACK_MODELS,
  getSubjectFootnotes,
  getSystemInstruction,
  CHEM_EXAM_RULES,
  AiProvider,
} from '../constants';
import { InputData, QuestionConfig, ExtractedQuestion, ReferenceUsageMode, describeDungSaiLevels, MATRIX_FULL_COLUMNS_RULE, getDungSaiQuestionCount, getDungSaiLevelTotals } from '../types';
import { FIGURE_JSON_HTML_INSTRUCTIONS, renderFiguresInHtml } from './figureEngine';
import {
  computeCv7991Layout, buildCv7991MatrixPrompt, buildCv7991SpecsPrompt,
  buildCv7991MatrixThead, buildCv7991SpecsThead, cv7991MatrixColumnCount, cv7991SpecsColumnCount, applyCv7991Thead,
} from './cv7991Template';
import { extractQuestionsLocally } from './docxMathParser';
import {
  MatrixContract, QTYPES, TYPE_LABEL, fmtNum, parseMatrixContract, resolveContracts,
  buildContractPromptBlock, buildSpecsTheadFromContract, contractMatchesConfig,
} from './matrixContract';
import { validateExamHtml, hasBlockingIssues, ExamIssue, TRUNCATION_MARKER } from './examValidator';
import { UserFacingError } from './errors';
import { normalizeChemText } from './chemFormat';
import { checkChemistryExam, enforceShortAnswerRounding } from './chemGuardrails';
import { applyExamHeader, getExamHeaderProfile, splitExamAndKey } from './examLayout';
import { parseExamForShuffle } from './examShuffle';
import { TN_THPT_BLUEPRINT } from '../data/chemistryReference';
export { UserFacingError };

// --- Dual AI Provider & Storage Keys ---
const GOOGLE_AI_PROVIDER_KEY = 'google_ai_provider';
const GOOGLE_AI_PROVIDER_SELECTION_SOURCE_KEY = 'google_ai_provider_selection_source';
const GEMINI_API_KEY_STORAGE_KEY = 'gemini_api_key';
const AGENT_PLATFORM_API_KEY_STORAGE_KEY = 'agent_platform_api_key';
const LEGACY_API_KEY_STORAGE_KEY = 'examcraft_api_key';
const LEGACY_USER_API_KEY_STORAGE_KEY = 'user_gemini_api_key';
const MODEL_STORAGE_KEY = GEMINI_MODEL_STORAGE_KEY;

const MODEL_ALIASES: Record<string, string> = {
  'gemini-3-flash-preview': 'gemini-3.8-flash',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-1.5-flash': 'gemini-2.5-flash',
};

export const GOOGLE_AI_API_KEY_PATTERN = /^(?:AIzaSy|AQ)\S{8,}$/;

export type GeminiApiErrorType =
  | 'INVALID_API_KEY'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_OVERLOADED'
  | 'TRANSIENT_SERVER_ERROR'
  | 'INVALID_ARGUMENT'
  | 'UNKNOWN';

// --- Tự động di trú (Migration) Model mặc định & Provider trong localStorage ---
const runStorageMigrationOnce = (() => {
  let migrated = false;
  return () => {
    if (migrated || typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    migrated = true;
    try {
      for (const legacyKey of LEGACY_GEMINI_MODEL_STORAGE_KEYS) {
        localStorage.removeItem(legacyKey);
      }
      const rawProvider = localStorage.getItem(GOOGLE_AI_PROVIDER_KEY);
      if (rawProvider === 'vertex') {
        localStorage.setItem(GOOGLE_AI_PROVIDER_KEY, 'gemini');
        localStorage.removeItem(GOOGLE_AI_PROVIDER_SELECTION_SOURCE_KEY);
      }
    } catch {
      // Ignore storage access errors in private/restricted mode
    }
  };
})();

runStorageMigrationOnce();

// --- Fallback Notice Pub/Sub (Thông báo nhẹ nhàng khi tự động chuyển model & tự ẩn khi hoàn tất) ---
type FallbackNoticeListener = (notice: string | null) => void;
const fallbackNoticeListeners = new Set<FallbackNoticeListener>();
let currentFallbackNotice: string | null = null;

export const setFallbackNotice = (notice: string | null): void => {
  currentFallbackNotice = notice;
  fallbackNoticeListeners.forEach(listener => {
    try {
      listener(notice);
    } catch {
      // ignore listener errors
    }
  });
};

export const getFallbackNotice = (): string | null => currentFallbackNotice;

export const subscribeFallbackNotice = (listener: FallbackNoticeListener): (() => void) => {
  fallbackNoticeListeners.add(listener);
  listener(currentFallbackNotice);
  return () => {
    fallbackNoticeListeners.delete(listener);
  };
};

export const getAiProvider = (): AiProvider => {
  runStorageMigrationOnce();
  const provider = localStorage.getItem(GOOGLE_AI_PROVIDER_KEY);
  if (provider === 'agent-platform') return 'agent-platform';
  return 'gemini';
};

export const setAiProvider = (provider: AiProvider): void => {
  localStorage.setItem(GOOGLE_AI_PROVIDER_KEY, provider);
  localStorage.setItem(GOOGLE_AI_PROVIDER_SELECTION_SOURCE_KEY, 'manual');
};

export const getApiKey = (provider: AiProvider = getAiProvider()): string | null => {
  if (provider === 'agent-platform') {
    return localStorage.getItem(AGENT_PLATFORM_API_KEY_STORAGE_KEY);
  }
  return (
    localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_USER_API_KEY_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY) ||
    null
  );
};

export const setApiKey = (key: string, provider: AiProvider = getAiProvider()): void => {
  const trimmed = key.trim();
  if (provider === 'agent-platform') {
    localStorage.setItem(AGENT_PLATFORM_API_KEY_STORAGE_KEY, trimmed);
  } else {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, trimmed);
    localStorage.setItem(LEGACY_API_KEY_STORAGE_KEY, trimmed);
  }
};

export const removeApiKey = (provider: AiProvider = getAiProvider()): void => {
  if (provider === 'agent-platform') {
    localStorage.removeItem(AGENT_PLATFORM_API_KEY_STORAGE_KEY);
  } else {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_USER_API_KEY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
  }
};

export const isValidGoogleAiApiKey = (key: string): boolean => {
  return GOOGLE_AI_API_KEY_PATTERN.test(key.trim());
};

export const isValidApiKey = (key: string, _provider: AiProvider = getAiProvider()): boolean => {
  return isValidGoogleAiApiKey(key);
};

const normalizeGeminiModel = (model: string | null): string | null => {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed) return null;
  return MODEL_ALIASES[trimmed] || trimmed;
};

export const getSelectedModel = (provider: AiProvider = getAiProvider()): string => {
  runStorageMigrationOnce();
  const storedModel = localStorage.getItem(MODEL_STORAGE_KEY);
  const normalizedModel = normalizeGeminiModel(storedModel);
  if (storedModel && normalizedModel && normalizedModel !== storedModel) {
    localStorage.setItem(MODEL_STORAGE_KEY, normalizedModel);
  }

  if (provider === 'agent-platform') {
    const isAgentPlatformCompatible = AGENT_PLATFORM_MODELS.some(m => m.id === normalizedModel);
    return isAgentPlatformCompatible && normalizedModel ? normalizedModel : DEFAULT_AGENT_PLATFORM_MODEL;
  }

  const isGeminiCompatible = GEMINI_MODELS.some(m => m.id === normalizedModel);
  return isGeminiCompatible && normalizedModel ? normalizedModel : DEFAULT_GEMINI_MODEL;
};

export const setSelectedModel = (model: string): void => {
  runStorageMigrationOnce();
  localStorage.setItem(MODEL_STORAGE_KEY, normalizeGeminiModel(model) || DEFAULT_GEMINI_MODEL);
};

export const getGeminiModelsToTry = (
  preferredModel?: string | null,
  provider: AiProvider = getAiProvider()
): string[] => {
  const fallbackList = PROVIDER_FALLBACK_MODELS[provider] || PROVIDER_FALLBACK_MODELS['gemini'];
  const defaultModel = provider === 'agent-platform' ? DEFAULT_AGENT_PLATFORM_MODEL : MODEL_NAME;
  const normalizedPreferred = normalizeGeminiModel(preferredModel || null);
  const primaryModel = normalizedPreferred || getSelectedModel(provider) || defaultModel;

  // Đối với Agent Platform, đảm bảo model đầu tiên tương thích với Agent Platform
  if (provider === 'agent-platform' && !AGENT_PLATFORM_MODELS.some(m => m.id === primaryModel)) {
    return Array.from(new Set([DEFAULT_AGENT_PLATFORM_MODEL, ...fallbackList]));
  }

  return Array.from(new Set([primaryModel, ...fallbackList]));
};

/**
 * Chuẩn hóa config gọi Gemini 3.x & 2.5 theo API.md v4.2:
 * - Không truyền temperature/topP/topK cho các model gemini-3*
 * - Mặc định dùng ThinkingLevel.MEDIUM cho bước sinh chính; ThinkingLevel.LOW cho bước trích xuất/phụ trợ
 * - Không bao giờ gửi 'minimal' cho gemini-3.8-flash / gemini-3.7-flash
 */
export const createGeminiConfig = ({
  provider = getAiProvider(),
  model,
  systemInstruction,
  responseMimeType,
  responseSchema,
  maxOutputTokens,
  thinkingLevel = ThinkingLevel.MEDIUM,
  temperature = 0.3,
}: {
  provider?: AiProvider;
  model: string;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  maxOutputTokens?: number;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
}) => {
  const isGemini3 = model.startsWith('gemini-3');
  const safeThinkingLevel =
    thinkingLevel === ThinkingLevel.MINIMAL ? ThinkingLevel.LOW : thinkingLevel;

  return {
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(responseMimeType ? { responseMimeType } : {}),
    ...(responseSchema ? { responseSchema } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    // Chỉ truyền temperature cho dòng 2.5 trở xuống (Gemini 3.x đã deprecated temperature/topP/topK)
    ...(!isGemini3 ? { temperature } : {}),
    ...(provider === 'gemini' && isGemini3
      ? { thinkingConfig: { thinkingLevel: safeThinkingLevel } }
      : {}),
  };
};

const getErrorText = (error: any): string => {
  const message = error?.message || error?.toString?.() || '';
  let serialized = '';
  try {
    serialized = JSON.stringify(error) || '';
  } catch {
    serialized = '';
  }
  return `${message} ${serialized}`.toLowerCase();
};

export const parseApiError = (error: any): GeminiApiErrorType => {
  // Lỗi đọc JSON (thường do AI bị cắt giữa chừng) hoặc lỗi nội dung đã giải thích → không phải lỗi máy chủ.
  // Trước đây "…JSON at position 15003" bị coi là lỗi 500 vì chứa chuỗi "500" → thử lại mọi model rồi báo "AI quá tải".
  if (error instanceof SyntaxError || error instanceof UserFacingError) return 'UNKNOWN';
  const text = getErrorText(error);
  const status = String(error?.status || error?.code || '').toLowerCase();
  // Mã HTTP phải đứng riêng (không nằm trong một số dài hơn như 15003, 40021)
  const hasCode = (code: string) => new RegExp(`(^|[^0-9.,])${code}(?![0-9])`).test(text);

  if (
    status === '429' ||
    hasCode('429') ||
    text.includes('resource_exhausted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('too many requests')
  ) {
    return 'QUOTA_EXCEEDED';
  }

  if (
    status === '503' ||
    hasCode('503') ||
    text.includes('unavailable') ||
    text.includes('service unavailable') ||
    text.includes('high demand') ||
    text.includes('overloaded') ||
    text.includes('try again later') ||
    text.includes('temporarily unavailable')
  ) {
    return 'MODEL_OVERLOADED';
  }

  if (
    status === '500' ||
    status === '502' ||
    status === '504' ||
    status === '404' ||
    hasCode('500') ||
    hasCode('502') ||
    hasCode('504') ||
    hasCode('404') ||
    text.includes('not_found') ||
    text.includes('deadline_exceeded') ||
    text.includes('deadline exceeded') ||
    text.includes('bad gateway') ||
    text.includes('fetch failed') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('econnreset') ||
    text.includes('etimedout')
  ) {
    return 'TRANSIENT_SERVER_ERROR';
  }

  if (status === '403' || text.includes('permission_denied') || hasCode('403')) {
    return 'PERMISSION_DENIED';
  }

  if (
    status === '401' ||
    hasCode('401') ||
    text.includes('api_key_invalid') ||
    text.includes('api key not valid') ||
    text.includes('invalid api key')
  ) {
    return 'INVALID_API_KEY';
  }

  if (status === '400' || text.includes('invalid_argument') || hasCode('400')) {
    return 'INVALID_ARGUMENT';
  }

  return 'UNKNOWN';
};

export const isFallbackEligibleError = (
  errorType: GeminiApiErrorType,
  provider: AiProvider = getAiProvider()
): boolean => {
  if (
    errorType === 'MODEL_OVERLOADED' ||
    errorType === 'TRANSIENT_SERVER_ERROR' ||
    errorType === 'QUOTA_EXCEEDED'
  ) {
    return true;
  }
  // Với Agent Platform API, cho phép thử model tương thích tiếp theo khi gặp 403 PERMISSION_DENIED
  if (provider === 'agent-platform' && errorType === 'PERMISSION_DENIED') {
    return true;
  }
  return false;
};

export const getFriendlyGeminiErrorMessage = (
  error: any,
  provider: AiProvider = getAiProvider()
): string => {
  if (error instanceof UserFacingError) return error.message;
  const errorType = parseApiError(error);
  if (/payload size|request entity too large|exceeds the (?:maximum|limit)/i.test(getErrorText(error))) {
    return 'File quá lớn để gửi cho AI (giới hạn khoảng 14 MB). Hãy nén PDF, giảm độ phân giải ảnh hoặc tách đề thành nhiều phần.';
  }
  if (errorType === 'INVALID_API_KEY') {
    return 'API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại trong Cài đặt.';
  }
  if (errorType === 'PERMISSION_DENIED') {
    if (provider === 'agent-platform') {
      return 'Google đã nhận API Key nhưng dự án/key chưa được cấp quyền gọi Agent Platform API hoặc model này. Vui lòng kiểm tra Agent Platform API đã bật, billing, API restrictions và quyền sử dụng model.';
    }
    return 'API key không có quyền truy cập Gemini API. Vui lòng kiểm tra lại trong Cài đặt.';
  }
  if (errorType === 'QUOTA_EXCEEDED') {
    return 'Đã hết quota hoặc vượt giới hạn tốc độ API. Vui lòng đợi rồi thử lại hoặc đổi API Key.';
  }
  if (errorType === 'MODEL_OVERLOADED' || errorType === 'TRANSIENT_SERVER_ERROR') {
    return 'Hệ thống AI đang tạm thời quá tải ở tất cả các model dự phòng. Vui lòng đợi 1-2 phút rồi thử lại hoặc chọn model nhẹ hơn (như Gemini 3.5 Flash-Lite).';
  }
  return `Lỗi API AI: ${error?.message || 'Không xác định'}`;
};

export function createGoogleAiClient(
  apiKey?: string | null,
  provider: AiProvider = getAiProvider()
): GoogleGenAI {
  const key = apiKey || getApiKey(provider);
  if (!key) {
    throw new Error('Vui lòng cấu hình API Key trước khi sử dụng tính năng này.');
  }

  if (provider === 'agent-platform') {
    // Cờ kỹ thuật của Google Gen AI SDK để định tuyến tới aiplatform.googleapis.com trong chế độ API key
    return new GoogleGenAI({ vertexai: true, apiKey: key });
  }
  return new GoogleGenAI({ apiKey: key });
}

// --- Retry helper for transient / overloaded errors ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (err: any): boolean => {
  const errorType = parseApiError(err);
  return errorType === 'MODEL_OVERLOADED' || errorType === 'TRANSIENT_SERVER_ERROR';
};

const callWithRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,
  label: string = ''
): Promise<T> => {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const waitMs = Math.min(1200 * Math.pow(2, attempt - 1), 4000);
        console.log(`[ExamCraft] ${label} Retry ${attempt}/${maxRetries} sau ${waitMs / 1000}s...`);
        await delay(waitMs);
      }
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (isRetryableError(err) && attempt < maxRetries) {
        console.warn(`[ExamCraft] ${label} Lỗi tạm thời (${err.status || err.code || '503'}), sẽ thử lại...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};


// --- Centralized Fallback Wrapper: try models in order and manage fallbackNotice ---
export interface FallbackOptions {
  /** Giới hạn số model thử trong chuỗi dự phòng (mặc định: thử hết). */
  maxModels?: number;
  /** Số lần thử lại cùng một model khi lỗi tạm thời (mặc định: 1). */
  maxRetries?: number;
}

export const callWithFallback = async <T = string>(
  promptFn: (ai: GoogleGenAI, model: string) => Promise<T>,
  preferredModel?: string | null,
  provider: AiProvider = getAiProvider(),
  options: FallbackOptions = {}
): Promise<T> => {
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error('Vui lòng cấu hình API Key trước khi sử dụng tính năng này.');
  }
  const ai = createGoogleAiClient(apiKey, provider);
  const modelsToTry = getGeminiModelsToTry(preferredModel, provider).slice(0, options.maxModels ?? Infinity);
  let lastError: any = null;

  try {
    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      try {
        console.log(`[ExamCraft] (${provider}) Trying model: ${model}`);
        const result = await callWithRetry(
          () => promptFn(ai, model),
          options.maxRetries ?? 1,
          `[${provider}:${model}]`
        );
        // BẮT BUỘC: Xóa cảnh báo fallback ngay khi tác vụ hoàn thành thành công
        setFallbackNotice(null);
        return result;
      } catch (err: any) {
        if (err instanceof UserFacingError) throw err;
        lastError = err;
        const errorType = parseApiError(err);
        console.warn(`[ExamCraft] (${provider}) Model ${model} failed (${errorType}):`, err.message || err);

        if (!isFallbackEligibleError(errorType, provider)) {
          break;
        }

        if (i < modelsToTry.length - 1) {
          const nextModel = modelsToTry[i + 1];
          setFallbackNotice(
            `Đang tự động chuyển từ ${model} sang ${nextModel} (do ${model} đang bận)...`
          );
        }
      }
    }
  } finally {
    // Đảm bảo xóa cảnh báo vàng khi kết thúc chuỗi gọi
    setFallbackNotice(null);
  }

  throw new Error(getFriendlyGeminiErrorMessage(lastError, provider));
};

export const generateContentWithModelFallback = async ({
  contents,
  config,
  preferredModel,
  provider = getAiProvider(),
  thinkingLevel = ThinkingLevel.MEDIUM,
  maxOutputTokens,
  temperature = 0.3,
}: {
  contents: any;
  config?: {
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: any;
    maxOutputTokens?: number;
    temperature?: number;
  };
  preferredModel?: string | null;
  provider?: AiProvider;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  temperature?: number;
}) => {
  return callWithFallback(
    async (ai, model) => {
      return await ai.models.generateContent({
        model,
        contents,
        config: createGeminiConfig({
          provider,
          model,
          systemInstruction: config?.systemInstruction,
          responseMimeType: config?.responseMimeType,
          responseSchema: config?.responseSchema,
          maxOutputTokens: config?.maxOutputTokens ?? maxOutputTokens,
          thinkingLevel,
          temperature: config?.temperature ?? temperature,
        }),
      });
    },
    preferredModel,
    provider
  );
};

// --- File utilities ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Kiểm tra output bị cắt do hết token (finishReason = MAX_TOKENS) ---
export const getFinishReason = (response: any): string =>
  String(response?.candidates?.[0]?.finishReason || response?.candidates?.[0]?.finish_reason || '');
export const wasTruncated = (response: any): boolean => /MAX_TOKENS/i.test(getFinishReason(response));
const stripCodeFences = (text: string): string => text.replace(/```html/gi, '').replace(/```/g, '');


const MATRIX_CONVERSION_RULES = `
    YÊU CẦU KỸ THUẬT (BẮT BUỘC):
    - Chép NGUYÊN VĂN mọi ô: tên chương/bài, mã câu (I.1, II.1a, Câu 1, C1a,b…), các con số, điểm, tỉ lệ %. KHÔNG tóm tắt, KHÔNG làm tròn, KHÔNG tự sửa số liệu.
    - Giữ nguyên cấu trúc gộp ô (rowspan, colspan) và đủ số cột ở mọi dòng (ô trống vẫn phải có <td></td>).
    - Các dòng tiêu đề cột đặt trong <thead> dùng <th>; dữ liệu đặt trong <tbody>.
    - Nếu tài liệu có CẢ "Ma trận" VÀ "Bản đặc tả" thì xuất THÀNH 2 BẢNG RIÊNG, mỗi bảng có tiêu đề <h2> ngay phía trên (VD: <h2>MA TRẬN ĐỀ KIỂM TRA…</h2> và <h2>BẢN ĐẶC TẢ ĐỀ KIỂM TRA…</h2>). Giữ các dòng tiêu đề / ghi chú (Môn, Lớp, Kỳ kiểm tra, Thời gian) dưới dạng <p>.
    - Font Times New Roman 13pt; border 1px solid black.
    - Output: chỉ mã HTML (<!DOCTYPE html>…), KHÔNG kèm markdown \`\`\`, KHÔNG giải thích.
    - Nếu không đọc được, trả về thông báo lỗi trong thẻ <p>.`;

const TRUNCATED_MATRIX_MESSAGE =
  'Bảng quá dài nên AI chỉ chuyển được một phần (bị cắt giữa bảng). Hãy: (a) tải lên file Word .docx gốc (app đọc trực tiếp, không qua AI), hoặc (b) tách riêng Ma trận và Đặc tả thành 2 file rồi dùng lối tắt "Ma trận + Đặc tả".';

// --- Service Functions ---

export const convertMatrixFileToHtml = async (file: File): Promise<string> => {
  const lowerName = (file.name || '').toLowerCase();
  if (/\.docx?$/.test(lowerName) || /wordprocessingml|msword/.test(file.type || '')) {
    // Gemini không đọc được Word qua inlineData → báo rõ thay vì gửi bytes rồi nhận bảng rác
    throw new UserFacingError(
      'Không đọc được file Word này. Nếu là file .doc đời cũ, hãy mở bằng Word → "Lưu thành" (Save As) định dạng .docx rồi tải lại; hoặc xuất ra PDF.'
    );
  }
  const base64Data = await fileToBase64(file);
  const mimeType = file.type || (lowerName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

  const prompt = `
    Bạn là một chuyên gia chuyển đổi dữ liệu.
    Tài liệu đính kèm là **MA TRẬN ĐỀ KIỂM TRA** (có thể kèm **BẢN ĐẶC TẢ**) dạng ảnh hoặc PDF.
    Nhiệm vụ: đọc các bảng trong tài liệu và chuyển thành **HTML Table** chuẩn, giống hệt bản gốc.
    ${MATRIX_CONVERSION_RULES}
  `;

  return callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: createGeminiConfig({
        model,
        thinkingLevel: ThinkingLevel.LOW,
        maxOutputTokens: 32768,
        temperature: 0,
      }),
    });
    if (wasTruncated(response)) throw new UserFacingError(TRUNCATED_MATRIX_MESSAGE);
    return stripCodeFences(response.text || "");
  });
};

// Convert extracted DOCX text + images to HTML table
export const convertMatrixTextToHtml = async (
  text: string,
  images?: { base64: string; mimeType: string }[]
): Promise<string> => {
  const hasImages = images && images.length > 0;

  const MAX_CHARS = 60000;
  if (text.length > MAX_CHARS) {
    console.warn(`[MatrixUpload] Văn bản ma trận dài ${text.length} ký tự, chỉ gửi ${MAX_CHARS} ký tự đầu cho AI.`);
  }
  const prompt = `
    Bạn là một chuyên gia chuyển đổi dữ liệu.
    Nội dung dưới đây là **MA TRẬN ĐỀ KIỂM TRA** (có thể kèm **BẢN ĐẶC TẢ**) được trích xuất từ file Word.
    ${hasImages ? `Có ${images!.length} hình ảnh đính kèm (bao gồm công thức đã chuyển thành hình). Hãy đọc kỹ các hình để hiểu nội dung.` : ''}
    Nhiệm vụ: dựng lại các bảng thành **HTML Table** chuẩn, giống hệt bản gốc.
    ${MATRIX_CONVERSION_RULES}
    - Nếu text chứa LaTeX ($...$), giữ nguyên LaTeX trong bảng.

    **NỘI DUNG FILE:**
    ${text.substring(0, MAX_CHARS)}
    ${text.length > MAX_CHARS ? '\n[... phần cuối file quá dài đã bị lược bớt ...]' : ''}
  `;

  const parts: any[] = [];

  // Add images first (if any)
  if (hasImages) {
    const imagesToSend = images!.slice(0, 10);
    for (const img of imagesToSend) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        }
      });
    }
  }

  // Add text prompt
  parts.push({ text: prompt });

  return callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: createGeminiConfig({
        model,
        thinkingLevel: ThinkingLevel.LOW,
        maxOutputTokens: 32768,
        temperature: 0,
      }),
    });
    if (wasTruncated(response)) throw new UserFacingError(TRUNCATED_MATRIX_MESSAGE);
    return stripCodeFences(response.text || "");
  });
};

// --- Trích xuất PPCT: giới hạn thời gian để không treo vô thời hạn ---
const EXTRACT_IDLE_TIMEOUT_MS = 90_000;   // Không nhận thêm dữ liệu trong 90s → coi như model treo, chuyển model khác
const EXTRACT_TOTAL_TIMEOUT_MS = 300_000; // Tối đa 5 phút/model; quá thì dùng phần đã nhận được
const EXTRACT_MAX_MODELS = 3;
export const EXTRACT_CANCELLED_MESSAGE = 'Đã hủy phân tích file.';

export interface ExtractProgress {
  model: string;
  chars: number;
  lessons: number;
}

/**
 * Cứu JSON bị cắt giữa chừng (do hết maxOutputTokens hoặc hết thời gian):
 * cắt tại object hoàn chỉnh cuối cùng rồi đóng các ngoặc còn mở.
 */
const repairTruncatedJson = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start === -1) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1;
  let lastSafeStack: string[] = [];
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) return text.substring(start, i + 1);
      if (ch === '}') {
        lastSafe = i;
        lastSafeStack = [...stack];
      }
    }
  }
  if (lastSafe === -1) return null;
  const closers = lastSafeStack.reverse().map(c => (c === '{' ? '}' : ']')).join('');
  return text.substring(start, lastSafe + 1) + closers;
};

export const extractInfoFromDocument = async (
  file: File,
  selectedSubject?: string,
  selectedGrade?: string,
  opts: { onProgress?: (p: ExtractProgress) => void; signal?: AbortSignal } = {}
): Promise<Partial<InputData> & { truncated?: boolean }> => {
  const isDocx = file.name.endsWith('.docx') || file.name.endsWith('.doc');

  let subjectConstraint = "";
  if (selectedSubject && selectedGrade) {
    subjectConstraint = `
    **ĐẶC BIỆT LƯU Ý MÔN VÀ LỚP BẮT BUỘC:** 
    - Người dùng ĐÃ CHỌN TRƯỚC: Môn học là "${selectedSubject}" và Khối lớp là "${selectedGrade}".
    - TUYỆT ĐỐI CHỈ trích xuất nội dung của môn "${selectedSubject}" lớp "${selectedGrade}". 
    - NẾU file có chứa nhiều môn khác hay khối lớp khác, HÃY BỎ QUA chúng.
    - Không được tự động đổi sang khối lớp khác hay môn học khác. Cố gắng tìm phần biểu diễn liên quan nhất.
    `;
  }

  const prompt = `
    Bạn là chuyên gia phân tích chương trình giáo dục Việt Nam. ${isDocx ? 'Nội dung dưới đây được trích xuất từ file Word (.docx).' : 'Hãy đọc file đính kèm (Kế hoạch dạy học/PPCT)'} và trích xuất dữ liệu cấu trúc cực kỳ chi tiết.

    **===== NGUYÊN TẮC VÀNG: CHỈ TRÍCH XUẤT, KHÔNG SÁNG TẠO =====**
    1. TUYỆT ĐỐI CHỈ trích xuất nội dung CÓ SẴN trong file đính kèm. KHÔNG ĐƯỢC tự bịa đặt, suy luận, hay thêm bất kỳ thông tin nào không có trong tài liệu.
    2. Tên môn học, tên chương, tên bài học, nội dung yêu cầu cần đạt PHẢI lấy NGUYÊN VĂN từ file gốc.
    3. KHÔNG ĐƯỢC nhầm lẫn nội dung giữa các môn học. Ví dụ: nếu file là PPCT Tin học thì chỉ được trích xuất nội dung Tin học, KHÔNG ĐƯỢC trả về nội dung của bất kỳ môn nào khác.
    4. Nếu không đọc được rõ một phần nào đó trong file, hãy ghi "Không đọc được" thay vì bịa nội dung.
    ${subjectConstraint}

    **===== QUY TẮC XÁC ĐỊNH MÔN HỌC (CỰC KỲ QUAN TRỌNG) =====**
    - Xác định môn học dựa trên TIÊU ĐỀ, HEADER của file (ví dụ: "KẾ HOẠCH DẠY HỌC MÔN CÔNG NGHỆ 8").
    - Nếu file chứa nội dung NHIỀU MÔN (ví dụ file tổng hợp PPCT cả trường), CHỈ trích xuất phần thuộc môn được chỉ định.
    - TUYỆT ĐỐI KHÔNG trộn lẫn nội dung các môn khác nhau.
    - Nếu không tìm thấy nội dung của môn được chỉ định trong file, hãy trả về chapters rỗng [] và ghi subject là môn bạn thực sự tìm thấy trong file.

    **NGÔN NGỮ BẮT BUỘC: TIẾNG VIỆT**
    - Toàn bộ output PHẢI bằng TIẾNG VIỆT, giữ nguyên như trong tài liệu gốc.
    - KHÔNG ĐƯỢC dịch sang tiếng Anh. Ví dụ: "Tin học" ≠ "Informatics", "Công nghệ" ≠ "Technology".

    Yêu cầu đầu ra: JSON Object (không markdown) với cấu trúc sau:
    {
      "subject": "Tên môn học CHÍNH XÁC như trong file (TIẾNG VIỆT) - phải khớp với nội dung thực tế trong file",
      "grade": "Khối lớp chính xác như trong file",
      "chapters": [
        {
          "id": "c1",
          "name": "Tên chương CHÍNH XÁC từ file gốc",
          "totalPeriods": 10,
          "lessons": [
            {
              "id": "c1_l1",
              "name": "Tên bài học CHÍNH XÁC từ file gốc",
              "periods": 2,
              "weekStart": 1,
              "weekEnd": 1,
              "objectives": {
                "biet": "Trích xuất nguyên văn yêu cầu cần đạt mức Biết từ file",
                "hieu": "Trích xuất nguyên văn yêu cầu cần đạt mức Hiểu từ file",
                "van_dung": "Trích xuất nguyên văn yêu cầu cần đạt mức Vận dụng từ file"
              }
            }
          ]
        }
      ]
    }

    Lưu ý quan trọng:
    1. Hãy cố gắng nhận diện số tiết và tuần học của từng bài. Nếu không ghi rõ, hãy ước lượng dựa trên tổng số tiết.
    2. Phần "objectives" (Yêu cầu cần đạt) là QUAN TRỌNG NHẤT. Hãy trích xuất NGUYÊN VĂN từ cột "Yêu cầu cần đạt" trong bảng PPCT. KHÔNG ĐƯỢC tự viết lại hay diễn giải.
    3. Nếu tài liệu là PDF dạng ảnh, hãy dùng khả năng Vision để đọc kỹ bảng biểu.
    4. Xác định chính xác môn học từ NỘI DUNG THỰC TẾ trong file (tiêu đề, header, nội dung bài học), không đoán mò.
    5. NHẮC LẠI: Toàn bộ giá trị JSON phải bằng TIẾNG VIỆT, trích xuất nguyên văn từ file, không bịa đặt.
    6. Trường "subject" trong JSON output phải phản ánh ĐÚNG môn học mà bạn thực sự đọc được từ file, KHÔNG ĐƯỢC copy môn từ constraint mà không xác minh.
  `;

  // Build parts based on file type
  const parts: any[] = [];

  if (isDocx) {
    // DOCX: Parse text + images first, then send to AI
    const { parseDocxWithMath } = await import('./docxMathParser');
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await parseDocxWithMath(arrayBuffer);
    console.log(`[ExtractInfo] DOCX parsed: ${parsed.text.length} chars, ${parsed.images.length} images, method=${parsed.method}`);

    // PPCT là bảng chữ: ảnh (logo, chữ ký...) chỉ làm chậm. Chỉ gửi ảnh khi gần như không có chữ (file scan).
    if (parsed.images.length > 0 && parsed.text.trim().length < 1000) {
      const imagesToSend = parsed.images.slice(0, 10);
      for (const img of imagesToSend) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }

    // Send text prompt with DOCX content appended
    parts.push({ text: prompt + `\n\n**NỘI DUNG FILE DOCX:**\n${parsed.text.substring(0, 60000)}` });
  } else {
    // PDF/Image: Send binary directly (Gemini supports these)
    const base64Data = await fileToBase64(file);
    parts.push({ inlineData: { mimeType: file.type || 'application/octet-stream', data: base64Data } });
    parts.push({ text: prompt });
  }

  // Streaming: hiển thị tiến độ cho người dùng, phát hiện model treo (idle) và cho phép hủy.
  let anyTimedOut = false;
  let resultText: string;
  try {
    resultText = await callWithFallback(async (ai, model) => {
      if (opts.signal?.aborted) throw new Error(EXTRACT_CANCELLED_MESSAGE);
      const controller = new AbortController();
      const state: { abortReason: 'idle' | 'total' | 'cancelled' | null } = { abortReason: null };
      const abort = (reason: 'idle' | 'total' | 'cancelled') => {
        if (state.abortReason) return;
        state.abortReason = reason;
        controller.abort();
      };
      const onUserAbort = () => abort('cancelled');
      opts.signal?.addEventListener('abort', onUserAbort);
      let idleTimer = setTimeout(() => abort('idle'), EXTRACT_IDLE_TIMEOUT_MS);
      const totalTimer = setTimeout(() => abort('total'), EXTRACT_TOTAL_TIMEOUT_MS);

      let text = '';
      opts.onProgress?.({ model, chars: 0, lessons: 0 });
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            ...createGeminiConfig({
              model,
              responseMimeType: "application/json",
              thinkingLevel: ThinkingLevel.LOW,
              maxOutputTokens: 32768,
            }),
            abortSignal: controller.signal,
          },
        });
        for await (const chunk of stream) {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => abort('idle'), EXTRACT_IDLE_TIMEOUT_MS);
          text += chunk.text || '';
          opts.onProgress?.({ model, chars: text.length, lessons: (text.match(/"periods"\s*:/g) || []).length });
        }
        return text || "{}";
      } catch (err) {
        if (state.abortReason === 'cancelled') throw new Error(EXTRACT_CANCELLED_MESSAGE);
        // Quá tổng thời gian nhưng đã nhận được nhiều dữ liệu → dùng phần đã có thay vì bỏ phí
        if (state.abortReason === 'total' && text.length > 500) return text;
        if (state.abortReason) {
          anyTimedOut = true;
          // "deadline exceeded" → được phân loại là lỗi tạm thời → chuyển sang model dự phòng
          throw new Error(`deadline exceeded: ${model} không phản hồi trong thời gian cho phép`);
        }
        throw err;
      } finally {
        clearTimeout(idleTimer);
        clearTimeout(totalTimer);
        opts.signal?.removeEventListener('abort', onUserAbort);
      }
    }, null, undefined, { maxModels: EXTRACT_MAX_MODELS, maxRetries: 0 });
  } catch (err: any) {
    if (opts.signal?.aborted) throw new Error(EXTRACT_CANCELLED_MESSAGE);
    if (anyTimedOut) {
      throw new Error("AI phản hồi quá lâu khi đọc file này. Hãy thử: (1) xóa bớt phần không cần thiết trong file PPCT (chỉ giữ học kỳ cần ra đề), hoặc (2) chọn model Gemini 3.5 Flash-Lite trong Cài đặt rồi tải lại file.");
    }
    throw err;
  }

  try {
    let truncated = false;
    let parsed: any;
    try {
      let jsonToParse = resultText;
      const start = resultText.indexOf('{');
      const end = resultText.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end >= start) {
        jsonToParse = resultText.substring(start, end + 1);
      }
      parsed = JSON.parse(jsonToParse);
    } catch (parseErr) {
      // Kết quả bị cắt giữa chừng (file PPCT quá dài) → giữ lại các bài đã trích xuất đủ
      const repaired = repairTruncatedJson(resultText);
      if (!repaired) throw parseErr;
      parsed = JSON.parse(repaired);
      truncated = true;
      console.warn(`[ExtractInfo] Kết quả AI bị cắt, đã khôi phục phần hoàn chỉnh (${repaired.length}/${resultText.length} ký tự).`);
    }
    // Chuẩn hoá: AI có thể trả "objectives": null / "lessons": null cho bài Ôn tập, Kiểm tra, Thực hành...
    const chapters = Array.isArray(parsed?.chapters)
      ? parsed.chapters.map((c: any) => ({
          ...c,
          lessons: Array.isArray(c?.lessons)
            ? c.lessons.map((l: any) => ({
                ...l,
                objectives: l?.objectives && typeof l.objectives === 'object'
                  ? l.objectives
                  : { biet: '', hieu: '', van_dung: '', van_dung_cao: '' },
              }))
            : [],
        }))
      : [];
    return { ...parsed, chapters, truncated };
  } catch (e) {
    console.error("Failed to parse JSON. Raw text:", resultText);
    throw new Error("Không thể nhận diện nội dung file. Vui lòng kiểm tra lại định dạng hoặc thử file khác.");
  }
};

export const generateStep1Matrix = async (
  data: InputData,
  selectedLessonIds: Set<string>,
): Promise<string> => {

  const selectedChapters: any[] = [];
  let totalSelectedPeriods = 0;

  data.chapters.forEach(chap => {
    const activeLessons = chap.lessons.filter(l => selectedLessonIds.has(l.id));
    if (activeLessons.length > 0) {
      selectedChapters.push({
        name: chap.name,
        lessons: activeLessons.map(l => ({
          name: l.name,
          periods: l.periods
        }))
      });
      totalSelectedPeriods += activeLessons.reduce((sum, l) => sum + (l.periods || 1), 0);
    }
  });

  const footnotes = getSubjectFootnotes(data.subject);
  const cvLayout = computeCv7991Layout(data.questionConfig, true);
  if (cvLayout.types.length === 0) {
    throw new UserFacingError('Cấu hình chưa có câu hỏi nào. Vui lòng chọn loại đề hoặc nhập số câu.');
  }
  // Đề ôn thi tốt nghiệp trải trên cả 3 khối: phân bổ theo khuôn mẫu đề thật, không theo số tiết
  const blueprintNote = isGraduationExam(data)
    ? `\n${TN_THPT_BLUEPRINT}\n  **QUY ĐỊNH RIÊNG CHO ĐỀ NÀY:** Dữ liệu đầu vào gồm cả 3 khối nên KHÔNG phân bổ theo số tiết mà theo tỉ trọng ở khuôn mẫu trên. Chỉ giữ lại các bài thực sự có lệnh hỏi; bài không có lệnh hỏi thì KHÔNG đưa vào bảng.\n`
    : '';
  const cvPrompt = buildCv7991MatrixPrompt({ data, layout: cvLayout, footnotes, selectedChapters, totalSelectedPeriods }) + blueprintNote;
  return callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: cvPrompt,
      config: createGeminiConfig({
        model,
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingLevel: ThinkingLevel.MEDIUM,
        maxOutputTokens: 16384,
        temperature: 0.1,
      }),
    });
    const text = (response.text || "Lỗi tạo ma trận.").replace(/```html/g, '').replace(/```/g, '');
    return normalizeChemText(applyCv7991Thead(text, buildCv7991MatrixThead(cvLayout), cv7991MatrixColumnCount(cvLayout)));
  });
};

const isGraduationExam = (data: InputData) => /tốt\s*nghiệp/i.test(data.examType);

const CV7991_CSS_INLINE = 'body { font-family: "Times New Roman", serif; font-size: 13pt; margin: 20px; } h2 { text-align: center; font-weight: bold; text-transform: uppercase; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid black; padding: 3px 5px; text-align: center; vertical-align: middle; } .left-align { text-align: left; vertical-align: top; } .bold { font-weight: bold; }';

/**
 * BẢN ĐẶC TẢ cho MA TRẬN NGƯỜI DÙNG TẢI LÊN:
 * giữ đúng cấu trúc cột (dạng × mức độ, kể cả VDC), đúng hàng bài học, chép nguyên mã/số câu;
 * <thead> dựng bằng code từ chính ma trận (không ép khung CV 7991 / mẫu 2-3-4).
 */
const generateSpecsFromUploadedMatrix = async (
  matrixContent: string,
  data: InputData,
  selectedLessonIds: Set<string>,
): Promise<string> => {
  const contract = parseMatrixContract(matrixContent, { prefer: 'matrix' });
  const head = contract.ok ? buildSpecsTheadFromContract(contract) : null;
  const footnotes = getSubjectFootnotes(data.subject);
  const objectivesMap: string[] = [];
  data.chapters.forEach(c => (c.lessons || []).forEach(l => {
    if (selectedLessonIds.has(l.id)) {
      objectivesMap.push(`- Bài "${l.name}": Biết: ${l.objectives?.biet || '...'} | Hiểu: ${l.objectives?.hieu || '...'} | Vận dụng: ${l.objectives?.van_dung || '...'} | Vận dụng cao: ${l.objectives?.van_dung_cao || '...'}`);
    }
  }));
  const levelNames = contract.hasVDC ? 'Biết / Hiểu / Vận dụng / Vận dụng cao' : 'Biết / Hiểu / Vận dụng';
  const cellExample = contract.codeStyle === 'roman' ? 'VD: "I.1, I.2", "II.1a, II.1b"'
    : contract.codeStyle === 'cau' ? 'VD: "Câu 1, 2", "Câu 1a, 1b"'
    : contract.codeStyle === 'count' ? 'VD: số lệnh hỏi "2", "1"' : '';

  const prompt = `
  Dựa trên **MA TRẬN ĐỀ KIỂM TRA do người dùng tải lên** (HTML) dưới đây, hãy lập **BẢN ĐẶC TẢ ĐỀ KIỂM TRA** (Full HTML Document)
  cho môn **${data.subject || '(theo tiêu đề ma trận)'}**, **lớp ${data.grade || '(theo tiêu đề ma trận)'}**, ${data.examType}.

  **NGUYÊN TẮC BẮT BUỘC — BÁM 100% MA TRẬN TẢI LÊN:**
  1. Giữ NGUYÊN danh sách Chủ đề/Chương và Nội dung/đơn vị kiến thức (đúng tên, đúng thứ tự, không thêm/bớt/gộp).
  2. Giữ NGUYÊN các dạng câu hỏi và các cột mức độ của ma trận (${levelNames}); không thêm dạng, không bỏ cột${contract.hasVDC ? ', cột Vận dụng cao giữ RIÊNG' : ''}.
  3. Mỗi ô câu hỏi (cùng hàng bài học, cùng dạng, cùng mức) ghi Y NGUYÊN nội dung ô tương ứng trong ma trận${cellExample ? ` (${cellExample})` : ''}; ô trống để trống. Không đổi cách đánh mã.
  4. Thêm cột **"Yêu cầu cần đạt"** (class="left-align") cho mỗi đơn vị kiến thức: ghi yêu cầu cần đạt cho TỪNG mức độ có câu hỏi ở hàng đó, mỗi mức một dòng bắt đầu bằng <b>- Biết:</b> / <b>- Hiểu:</b> / <b>- Vận dụng:</b>${contract.hasVDC ? ' / <b>- Vận dụng cao:</b>' : ''}; dùng động từ đo được, đúng Chương trình GDPT 2018 môn ${data.subject || 'học'} lớp ${data.grade || ''}.
  5. KHÔNG có cột Tổng / Tỉ lệ % theo hàng. Cuối bảng thêm các dòng "Tổng số câu", "Tổng số điểm", "Tỉ lệ %" chép đúng số liệu tương ứng của ma trận cho các cột mức độ.
  ${head ? `6. Bảng có đúng **${head.columnCount} cột**. Dùng NGUYÊN VĂN phần <thead> sau (không sửa, không thêm/bớt cột):
\`\`\`
${head.thead}
\`\`\`` : ''}

  ${contract.ok ? buildContractPromptBlock(contract, { maxYccd: 0 }) : ''}

  **MA TRẬN ĐẦU VÀO (NGUỒN CHUẨN DUY NHẤT):**
  ${matrixContent}

  ${objectivesMap.length ? `**YÊU CẦU CẦN ĐẠT THAM KHẢO THEO BÀI:**\n  ${objectivesMap.join('\n  ')}` : ''}

  **YÊU CẦU OUTPUT:**
  1. Full HTML Document (<!DOCTYPE html>…), CSS trong <style>: ${CV7991_CSS_INLINE}
  2. Trên bảng: <h2>BẢN ĐẶC TẢ ĐỀ KIỂM TRA …</h2> — giữ đúng môn/lớp/kỳ kiểm tra như tiêu đề ma trận; năm học giữ như ma trận (nếu ma trận để trống thì ghi "20... - 20...").
  3. Dưới bảng: chú thích năng lực — nếu ma trận có chú thích năng lực thì chép lại đúng như ma trận, nếu không thì dùng: ${footnotes.replace(/\n/g, ' ')}
  4. Chỉ trả về HTML, không giải thích.

  **KIỂM TRA TRƯỚC KHI TRẢ KẾT QUẢ:** tập mã câu/số câu ở từng cột của đặc tả phải TRÙNG KHỚP với ma trận; danh sách bài học trùng khớp ma trận.
  `;

  return callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: createGeminiConfig({
        model,
        systemInstruction: getSystemInstruction(true),
        thinkingLevel: ThinkingLevel.MEDIUM,
        maxOutputTokens: 32768,
        temperature: 0.1,
      }),
    });
    if (wasTruncated(response)) {
      throw new UserFacingError('Bản đặc tả quá dài nên AI bị cắt giữa chừng. Vui lòng bấm tạo lại hoặc chọn model Pro trong Cài đặt.');
    }
    const text = stripCodeFences(response.text || 'Lỗi tạo đặc tả.');
    return head ? applyCv7991Thead(text, head.thead, head.columnCount) : text;
  });
};

export const generateStep2Specs = async (
  matrixContent: string,
  data: InputData,
  selectedLessonIds: Set<string>,
  isUploadedMatrix: boolean = false
): Promise<string> => {
  // Ma trận do người dùng tải lên → đặc tả theo đúng cấu trúc của ma trận đó (bỏ qua thang điểm mặc định)
  if (isUploadedMatrix && matrixContent && /<table/i.test(matrixContent)) {
    return normalizeChemText(await generateSpecsFromUploadedMatrix(matrixContent, data, selectedLessonIds));
  }

  const objectivesMap: string[] = [];
  data.chapters.forEach(c => (c.lessons || []).forEach(l => {
    if (selectedLessonIds.has(l.id)) {
      objectivesMap.push(`- Bài "${l.name}": \n   + Biết: ${l.objectives?.biet || '...'}\n   + Hiểu: ${l.objectives?.hieu || '...'}\n   + Vận dụng: ${l.objectives?.van_dung || '...'}`);
    }
  }));

  const footnotes = getSubjectFootnotes(data.subject);
  const cvLayout = computeCv7991Layout(data.questionConfig, true);
  if (cvLayout.types.length === 0) {
    throw new UserFacingError('Cấu hình chưa có câu hỏi nào. Vui lòng chọn loại đề hoặc nhập số câu.');
  }
  const cvPrompt = buildCv7991SpecsPrompt({ data, layout: cvLayout, footnotes, matrixContent, objectivesMap, isUploadedMatrix });
  return callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: cvPrompt,
      config: createGeminiConfig({
        model,
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingLevel: ThinkingLevel.MEDIUM,
        maxOutputTokens: 16384,
        temperature: 0.1,
      }),
    });
    const text = (response.text || "Lỗi tạo đặc tả.").replace(/```html/g, '').replace(/```/g, '');
    return normalizeChemText(applyCv7991Thead(text, buildCv7991SpecsThead(cvLayout), cv7991SpecsColumnCount(cvLayout)));
  });
};

// --- Extract questions from reference document (Instant local parser + Fast AI fallback for PDF/Images) ---
export const extractQuestionsFromReference = async (
  text: string,
  images: { base64: string; mimeType: string }[],
  _specsHtml: string,
  subject: string,
  grade: string,
  forceAi: boolean = false
): Promise<ExtractedQuestion[]> => {
  const hasImages = images && images.length > 0;
  const hasPdfOrImageOnly = hasImages && (!text || text.replace(/\[Tài liệu PDF\/Hình ảnh đính kèm:[^\]]*\]/g, '').trim().length < 50);

  // Fast Path (< 5ms): Use local deterministic parser first when text is available
  if (!forceAi && !hasPdfOrImageOnly && text && text.trim().length > 20) {
    const localQuestions = extractQuestionsLocally(text);
    if (localQuestions.length > 0) {
      console.log(`[ExamCraft] Instant local parser extracted ${localQuestions.length} questions in <5ms`);
      return localQuestions;
    }
  }

  const prompt = `
  Trích xuất nhanh danh sách câu hỏi từ tài liệu môn ${subject || 'THPT'} lớp ${grade || ''}.
  ${hasImages ? `Có ${images.length} tệp/hình đính kèm, hãy chép công thức trong hình bằng thẻ <sub>, <sup>.` : ''}

  QUY TẮC:
  1. Giữ nguyên văn câu hỏi; công thức hóa học viết bằng thẻ <sub>, <sup>.
  2. Phân loại:
     - "type": "type1" (4 lựa chọn A,B,C,D), "type2" (Đúng/Sai a,b,c,d), "type3" (Trả lời ngắn), "essay" (Tự luận)
     - "level": "biet" | "hieu" | "van_dung" | "van_dung_cao"

  NỘI DUNG TÀI LIỆU:
  ${text.substring(0, 18000)}

  OUTPUT JSON Array:
  [
    {
      "id": "q1",
      "type": "type1",
      "level": "biet",
      "topic": "Chủ đề",
      "content": "Nội dung câu hỏi",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "subItems": null
    }
  ]
  `;

  const parts: any[] = [];

  if (hasImages) {
    const imagesToSend = images.slice(0, 8);
    for (const img of imagesToSend) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }
  }

  parts.push({ text: prompt });

  const resultText = await callWithFallback(async (ai, model) => {
    console.log(`[ExamCraft] Fast AI question extraction with model: ${model}`);
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: createGeminiConfig({
        model,
        responseMimeType: 'application/json',
        thinkingLevel: ThinkingLevel.LOW,
        maxOutputTokens: 16384,
        temperature: 0.1,
      }),
    });
    return response.text || '[]';
  });

  try {
    let jsonStr = resultText;
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    }
    const start = jsonStr.indexOf('[');
    const end = jsonStr.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end >= start) {
      jsonStr = jsonStr.substring(start, end + 1);
    }
    const questions: ExtractedQuestion[] = JSON.parse(jsonStr);
    console.log(`[ExamCraft] Extracted ${questions.length} questions from reference`);
    return questions;
  } catch (e) {
    console.error('[ExamCraft] Failed to parse extracted questions:', resultText.substring(0, 500));
    return [];
  }
};

/**
 * Chọn HỢP ĐỒNG SỐ LIỆU dùng để sinh đề:
 *  - Ma trận tải lên: luôn dùng (đọc được) — đặc tả khớp ma trận thì ưu tiên đặc tả vì có Yêu cầu cần đạt.
 *  - Ma trận do AI sinh: chỉ dùng khi số câu trong bảng khớp đúng cấu hình (để lấy thêm bài học/mức của từng câu).
 */
export const pickExamContract = (
  matrixContent: string | undefined,
  specsContent: string | undefined,
  questionConfig: QuestionConfig,
  isUploadedMatrix: boolean
): MatrixContract | null => {
  const { primary } = resolveContracts(matrixContent, specsContent);
  if (!primary || !primary.ok) return null;
  if (isUploadedMatrix) return primary;
  return contractMatchesConfig(primary, questionConfig) ? primary : null;
};

const TYPE_KEY_TO_ROMAN: Record<string, 'I' | 'II' | 'III' | 'IV'> = { type1: 'I', type2: 'II', type3: 'III', essay: 'IV' };

const buildContractStructureInstructions = (contract: MatrixContract): string => {
  if (contract.sections) {
    // Ma trận theo kĩ năng (Ngữ văn: Đọc hiểu / Viết; Tiếng Anh: Listening / Reading …)
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    const lines: string[] = [buildContractPromptBlock(contract), '', '**CẤU TRÚC ĐỀ BẮT BUỘC (đúng theo hợp đồng số liệu trên):**'];
    contract.sections.forEach((sec, i) => {
      lines.push(`- **PHẦN ${roman[i] || i + 1}. ${sec.name.toUpperCase()}${sec.points !== undefined ? ` (${fmtNum(sec.points)} điểm)` : ''}:** đúng ${sec.questions.length} câu.`);
    });
    lines.push(contract.continuousNumbering
      ? '- Đánh số câu LIÊN TỤC qua các phần. Câu trắc nghiệm có đủ 4 phương án A, B, C, D.'
      : '- Mỗi phần đánh số lại từ "Câu 1". Phần đọc hiểu phải có văn bản/ngữ liệu đọc hiểu trước các câu hỏi; phần viết ghi rõ yêu cầu bài viết.');
    lines.push('- Hướng dẫn chấm: có đáp án/gợi ý và biểu điểm chi tiết cho từng câu, tổng điểm mỗi phần đúng như hợp đồng.');
    return lines.join('\n') + '\n';
  }
  // Điểm từng phần: theo file; file không ghi điểm → thang mặc định CV 7991
  const pts: Partial<Record<'I' | 'II' | 'III' | 'IV', number>> = { ...contract.points.byType };
  if (!contract.points.fromFile && contract.questionConfig) {
    computeCv7991Layout(contract.questionConfig, true).types.forEach(t => { pts[TYPE_KEY_TO_ROMAN[t.key]] = t.points; });
  }
  const p = (t: 'I' | 'II' | 'III' | 'IV') => (pts[t] !== undefined ? ` (${fmtNum(pts[t]!)} điểm)` : '');
  const q = contract.questionCount;
  const lines: string[] = [];
  lines.push(buildContractPromptBlock(contract));
  lines.push('');
  lines.push('**CẤU TRÚC ĐỀ BẮT BUỘC (đúng theo hợp đồng số liệu trên):**');
  if (q.I) lines.push(`- **PHẦN I. ${TYPE_LABEL.I.toUpperCase()}${p('I')}:** đúng ${q.I} câu (Câu 1 → Câu ${q.I}); mỗi câu có đúng 4 phương án A, B, C, D và chỉ 1 phương án đúng.`);
  if (q.II) lines.push(`- **PHẦN II. ${TYPE_LABEL.II.toUpperCase()}${p('II')}:** đúng ${q.II} câu (Câu 1 → Câu ${q.II}); mỗi câu gồm 1 đề dẫn chung và ĐÚNG 4 ý a), b), c), d); mức độ từng ý đúng như hợp đồng.`);
  if (q.III) lines.push(`- **PHẦN III. ${TYPE_LABEL.III.toUpperCase()}${p('III')}:** đúng ${q.III} câu (Câu 1 → Câu ${q.III}); mỗi câu có đáp án ngắn, xác định duy nhất (ưu tiên đáp án là số).`);
  if (q.IV) lines.push(`- **PHẦN IV. ${TYPE_LABEL.IV.toUpperCase()}${p('IV')}:** đúng ${q.IV} câu (Câu 1 → Câu ${q.IV}); câu có nhiều ý thì ghi a), b)… đúng số ý trong hợp đồng; ghi điểm từng câu theo hợp đồng.`);
  lines.push('- Tiêu đề mỗi phần ghi đúng dạng "PHẦN I. …", "PHẦN II. …" (giữ số La Mã theo dạng câu hỏi như trên, kể cả khi ma trận không có một phần nào đó).');
  lines.push('- Mỗi câu hỏi PHẢI đúng đơn vị kiến thức, đúng mức độ (và đúng Yêu cầu cần đạt nếu có) đã ghi cho câu đó trong hợp đồng.');
  return lines.join('\n') + '\n';
};

const generateStep3ExamRaw = async (
  specsContent: string,
  questionConfig: QuestionConfig,
  inputData: InputData,
  referenceText?: string,
  referenceImages?: { base64: string; mimeType: string }[],
  extractedQuestions?: ExtractedQuestion[],
  referenceMode: ReferenceUsageMode = 'exact',
  matrixContent?: string,
  isUploadedMatrix: boolean = false,
  opts: { concise?: boolean } = {}
): Promise<{ raw: string; contract: MatrixContract | null; counts: { type1: number; type2: number; type3: number; essay: number } }> => {

  const counts = {
    type1: questionConfig.type1.biet + questionConfig.type1.hieu + questionConfig.type1.van_dung + questionConfig.type1.van_dung_cao,
    type2: getDungSaiQuestionCount(questionConfig),
    type3: questionConfig.type3.biet + questionConfig.type3.hieu + questionConfig.type3.van_dung + questionConfig.type3.van_dung_cao,
    essay: questionConfig.essay.biet + questionConfig.essay.hieu + questionConfig.essay.van_dung + questionConfig.essay.van_dung_cao,
  };

  // ===== HỢP ĐỒNG SỐ LIỆU: nguồn chuẩn số câu / mức độ / bài học của từng câu =====
  const contract = pickExamContract(matrixContent, specsContent, questionConfig, isUploadedMatrix);
  if (contract) {
    counts.type1 = contract.questionCount.I;
    counts.type2 = contract.questionCount.II;
    counts.type3 = contract.questionCount.III;
    counts.essay = contract.questionCount.IV; // số CÂU tự luận (không phải số lệnh hỏi)
  }

  // Build a clear whitelist of allowed parts
  const allowedParts: string[] = [];
  if (contract?.sections) {
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    contract.sections.forEach((sec, i) => allowedParts.push(`PHẦN ${roman[i] || i + 1} (${sec.name})`));
  } else {
  if (counts.type1 > 0) allowedParts.push('PHẦN I (Trắc nghiệm nhiều lựa chọn)');
  if (counts.type2 > 0) allowedParts.push('PHẦN II (Đúng/Sai)');
  if (counts.type3 > 0) allowedParts.push('PHẦN III (Trả lời ngắn)');
  if (counts.essay > 0) allowedParts.push('PHẦN IV (Tự luận)');
  }

  let structureInstructions = "**CẤU TRÚC ĐỀ THI & ĐÁP ÁN CẦN TẠO (BÁM SÁT 100% MA TRẬN & ĐẶC TẢ):**\n";

  if (contract) {
    structureInstructions += buildContractStructureInstructions(contract);
  } else if (isUploadedMatrix) {
    // Ma trận tải lên nhưng máy không đọc được số liệu → để AI bám trực tiếp bảng, KHÔNG dùng cấu hình mặc định
    structureInstructions += `- Đọc KỸ Ma trận và Bảng đặc tả ở trên: tạo ĐÚNG số phần, số câu, số ý và mức độ như trong bảng (mỗi mã câu / mỗi lệnh hỏi trong bảng tương ứng đúng 1 câu / 1 ý trong đề).\n- Dạng nào bảng không có thì KHÔNG tạo. Thang điểm theo dòng "Tổng số điểm" của bảng (nếu có).\n- Tiêu đề phần ghi dạng "PHẦN I. …", "PHẦN II. …"; Phần I mỗi câu 4 phương án A–D; Phần II mỗi câu 4 ý a) b) c) d).\n`;
  } else {
  if (counts.type1 > 0) {
    structureInstructions += `- **PHẦN I (Trắc nghiệm nhiều lựa chọn):** Tạo đúng ${counts.type1} câu hỏi (Nhận biết: ${questionConfig.type1.biet}, Thông hiểu: ${questionConfig.type1.hieu}, Vận dụng: ${questionConfig.type1.van_dung + questionConfig.type1.van_dung_cao}) và Đáp án Phần I.\n`;
  } else {
    structureInstructions += `- **PHẦN I:** KHÔNG ĐƯỢC TẠO (Số câu = 0). Bỏ qua hoàn toàn.\n`;
  }

  if (counts.type2 > 0) {
    structureInstructions += `- **PHẦN II (Đúng/Sai):** Tạo đúng ${counts.type2} câu hỏi (mỗi câu 4 ý a,b,c,d) và Đáp án Phần II (BẮT BUỘC có bảng thông tin hướng dẫn giải chi tiết và đủ 4 đáp án a, b, c, d cho mỗi câu).\n`;
    const dsLevels = describeDungSaiLevels(questionConfig);
    if (dsLevels) structureInstructions += `  ${dsLevels}\n`;
  } else {
    structureInstructions += `- **PHẦN II:** KHÔNG ĐƯỢC TẠO (Số câu = 0). Bỏ qua hoàn toàn.\n`;
  }

  if (counts.type3 > 0) {
    structureInstructions += `- **PHẦN III (Trả lời ngắn):** Tạo đúng ${counts.type3} câu hỏi (Nhận biết: ${questionConfig.type3.biet}, Thông hiểu: ${questionConfig.type3.hieu}, Vận dụng: ${questionConfig.type3.van_dung + questionConfig.type3.van_dung_cao}) và Đáp án Phần III.\n`;
  } else {
    structureInstructions += `- **PHẦN III:** KHÔNG ĐƯỢC TẠO (Số câu = 0). Bỏ qua hoàn toàn.\n`;
  }

  if (counts.essay > 0) {
    structureInstructions += `- **PHẦN IV (Tự luận):** Tạo đúng ${counts.essay} câu hỏi (Nhận biết: ${questionConfig.essay.biet}, Thông hiểu: ${questionConfig.essay.hieu}, Vận dụng: ${questionConfig.essay.van_dung + questionConfig.essay.van_dung_cao}) và Đáp án/Hướng dẫn chấm chi tiết Phần IV.\n`;
  } else {
    structureInstructions += `- **PHẦN IV (Tự luận):** ⛔ CẤM TẠO. Số câu = 0. TUYỆT ĐỐI KHÔNG SINH RA BẤT KỲ CÂU TỰ LUẬN NÀO.\n`;
  }
  } // end: không có hợp đồng số liệu
  if (opts.concise) {
    structureInstructions += `\n**⚠️ GIỚI HẠN ĐỘ DÀI:** Lần trước đề bị cắt cụt vì quá dài. Lần này viết lời giải/hướng dẫn chấm NGẮN GỌN (chỉ các bước chính), KHÔNG lặp lại đề bài trong phần đáp án — nhưng vẫn phải ĐỦ tất cả câu và đủ đáp án.\n`;
  }

  if (!isUploadedMatrix) {
    const scoreLine = computeCv7991Layout(questionConfig, true).types
      .map(t => `Phần ${t.roman}: ${fmtNum(t.points)} điểm`).join('; ');
    structureInstructions += `\n**THANG ĐIỂM BẮT BUỘC:** ${scoreLine}. Phần II chấm lũy tiến theo số ý đúng của mỗi câu: 1 ý 10%, 2 ý 25%, 3 ý 50%, 4 ý 100% số điểm của câu. Ghi rõ điểm ở tiêu đề khu vực đáp án của từng phần.\n`;
  }
  structureInstructions += `\n**⚠️ DANH SÁCH PHẦN ĐƯỢC PHÉP TẠO (WHITELIST):** ${allowedParts.length > 0 ? allowedParts.join(', ') : 'Theo đúng các phần có trong Ma trận & Bảng đặc tả'}.\n`;
  structureInstructions += `**⛔ NGHIÊM CẤM:** Bất kỳ phần nào KHÔNG có trong Ma trận/Bảng đặc tả và whitelist trên đều KHÔNG ĐƯỢC TẠO.\n`;
  structureInstructions += `**🎯 BẮT BUỘC TUÂN THỦ MA TRẬN & ĐẶC TẢ:** Từng câu hỏi (Câu 1, Câu 2...) ở mỗi phần PHẢI khớp chính xác với **Đơn vị kiến thức/Bài học**, **Mức độ tư duy (Nhận biết / Thông hiểu / Vận dụng)** và **Yêu cầu cần đạt** tại đúng dòng/cột tương ứng trong Ma trận và Bảng đặc tả!\n`;

  // Build reference section
  let referenceSection = '';
  const hasExtractedQuestions = extractedQuestions && extractedQuestions.length > 0;
  const hasRawReference = (referenceText && referenceText.trim().length > 0) || (referenceImages && referenceImages.length > 0);

  if (hasExtractedQuestions) {
    const questionsByType = {
      type1: extractedQuestions!.filter(q => q.type === 'type1'),
      type2: extractedQuestions!.filter(q => q.type === 'type2'),
      type3: extractedQuestions!.filter(q => q.type === 'type3'),
      essay: extractedQuestions!.filter(q => q.type === 'essay'),
    };

    let questionsListing = '';
    for (const [typeKey, questions] of Object.entries(questionsByType)) {
      if (questions.length === 0) continue;
      const typeName = typeKey === 'type1' ? 'Dạng I (4 lựa chọn)' : typeKey === 'type2' ? 'Dạng II (Đúng/Sai)' : typeKey === 'type3' ? 'Dạng III (Trả lời ngắn)' : 'Tự luận';
      questionsListing += `\n### ${typeName} (${questions.length} câu):\n`;
      for (const q of questions) {
        questionsListing += `\n**[${q.id}] Mức: ${q.level} | Chủ đề: ${q.topic}**\n`;
        questionsListing += `${q.content}\n`;
        if (q.options && q.options.length > 0) {
          questionsListing += q.options.join('\n') + '\n';
        }
        if (q.subItems && q.subItems.length > 0) {
          questionsListing += q.subItems.join('\n') + '\n';
        }
        if (q.answer) {
          questionsListing += `Đáp án: ${q.answer}\n`;
        }
      }
    }

    if (referenceMode === 'adapt') {
      referenceSection = `
  **===== NGÂN HÀNG CÂU HỎI MẪU — CHẾ ĐỘ: THAM KHẢO DẠNG CÂU HỎI, THAY SỐ HOẶC BỐI CẢNH (BẮT BUỘC TUÂN THỦ) =====**
  
  Dưới đây là ${extractedQuestions!.length} câu hỏi mẫu từ tài liệu tham khảo của người dùng.
  Phân bổ: Dạng I: ${questionsByType.type1.length}, Dạng II: ${questionsByType.type2.length}, Dạng III: ${questionsByType.type3.length}, Tự luận: ${questionsByType.essay.length}
  
  **CÁCH SỬ DỤNG NGÂN HÀNG CÂU HỎI MẪU (BẮT BUỘC TUÂN THỦ):**
  1. **THAM KHẢO DẠNG CÂU HỎI:** Chọn các câu hỏi mẫu bên dưới có dạng bài phù hợp với từng yêu cầu trong Ma trận và Bảng đặc tả (đúng dạng câu hỏi, đúng mức độ Nhận biết / Thông hiểu / Vận dụng, đúng chủ đề).
  2. **THAY SỐ LIỆU HOẶC BỐI CẢNH CHO PHÙ HỢP:**
     - TUYỆT ĐỐI KHÔNG chép nguyên xi số liệu của câu hỏi gốc.
     - Hãy **thay đổi số liệu, chất tham gia, quy trình hoặc bối cảnh thực tế** dựa trên cấu trúc/dạng của câu hỏi mẫu để tạo thành câu hỏi mới tương đương về mức độ tư duy và phù hợp chặt chẽ với Bảng đặc tả.
     - Tính toán lại chính xác **các phương án A, B, C, D, các mệnh đề Đúng/Sai a), b), c), d), đáp án trả lời ngắn và lời giải chi tiết** theo số liệu/bối cảnh mới.
  3. Nếu ngân hàng mẫu chưa có câu hỏi cho một nội dung nào đó trong Bảng đặc tả → tự biên soạn câu hỏi mới bám sát Bảng đặc tả theo phong cách tương tự.
  4. Sắp xếp lại số thứ tự câu hỏi (Câu 1, Câu 2...) cho liên tục.
  
  **DANH SÁCH CÂU HỎI MẪU THAM KHẢO:**
  ${questionsListing}
  
  **===== HẾT NGÂN HÀNG CÂU HỎI MẪU =====**
  `;
    } else {
      referenceSection = `
  **===== NGÂN HÀNG CÂU HỎI ĐÃ TRÍCH XUẤT — CHẾ ĐỘ: TRÍCH XUẤT CHÍNH XÁC (BẮT BUỘC SỬ DỤNG) =====**
  
  Dưới đây là ${extractedQuestions!.length} câu hỏi đã được trích xuất CHÍNH XÁC từ tài liệu tham khảo của người dùng.
  Phân bổ: Dạng I: ${questionsByType.type1.length}, Dạng II: ${questionsByType.type2.length}, Dạng III: ${questionsByType.type3.length}, Tự luận: ${questionsByType.essay.length}
  
  **CÁCH SỬ DỤNG NGÂN HÀNG CÂU HỎI (BẮT BUỘC TUÂN THỦ):**
  1. ƯU TIÊN SỐ 1: Sử dụng CHÍNH XÁC NGUYÊN VĂN các câu hỏi từ ngân hàng bên dưới.
  2. Chọn câu hỏi PHÙ HỢP với Ma trận và Đặc tả (đúng dạng, đúng mức độ, đúng chủ đề).
  3. KHÔNG ĐƯỢC thay đổi nội dung, số liệu, hay cách diễn đạt của câu hỏi gốc.
  4. Giữ nguyên công thức hóa học như trong ngân hàng, viết lại bằng thẻ <sub>, <sup>.
  5. Nếu ngân hàng KHÔNG ĐỦ câu hỏi cho một dạng/mức độ nào đó → BỔ SUNG thêm câu hỏi MỚI theo phong cách tương tự.
  6. Sắp xếp lại số thứ tự câu hỏi (Câu 1, Câu 2...) cho liên tục.
  
  **DANH SÁCH CÂU HỎI:**
  ${questionsListing}
  
  **===== HẾT NGÂN HÀNG CÂU HỎI =====**
  `;
    }
  } else if (hasRawReference) {
    const hasImages = referenceImages && referenceImages.length > 0;
    const safeText = referenceText || '';
    if (referenceMode === 'adapt') {
      referenceSection = `
  **===== TÀI LIỆU THAM KHẢO — CHẾ ĐỘ: THAM KHẢO DẠNG CÂU HỎI, THAY SỐ HOẶC BỐI CẢNH =====**
  
  Dưới đây là nội dung tài liệu tham khảo được người dùng tải lên. ${hasImages ? `Có ${referenceImages!.length} tệp/hình ảnh đính kèm (bao gồm PDF hoặc công thức).` : ''}
  
  **CÁCH SỬ DỤNG TÀI LIỆU THAM KHẢO:**
  - Tham khảo cấu trúc, dạng câu hỏi, dạng bài trong tài liệu tham khảo phù hợp với Ma trận và Bảng đặc tả.
  - **THAY SỐ HOẶC BỐI CẢNH CHO PHÙ HỢP:** Không chép y nguyên câu hỏi gốc; hãy thay đổi số liệu, chất, dữ kiện hoặc bối cảnh thực tế và tính toán lại đáp án, lời giải chi tiết thật chính xác.
  - Bổ sung câu hỏi mới nếu tài liệu tham khảo chưa có đủ dạng bài cho một mục trong Bảng đặc tả.
  ${hasImages ? '- Đọc KỸ các tệp/hình ảnh đính kèm — chép lại mọi công thức hóa học bằng thẻ <sub>, <sup>.' : ''}
  
  **NỘI DUNG TÀI LIỆU THAM KHẢO:**
  ${safeText.substring(0, 15000)}
  ${safeText.length > 15000 ? '\n[... Nội dung đã được cắt ngắn do quá dài ...]' : ''}
  
  **===== HẾT TÀI LIỆU THAM KHẢO =====**
  `;
    } else {
      referenceSection = `
  **===== TÀI LIỆU THAM KHẢO (ĐỀ MẪU / NGÂN HÀNG CÂU HỎI) — CHẾ ĐỘ: TRÍCH XUẤT CHÍNH XÁC =====**
  
  Dưới đây là nội dung tài liệu tham khảo được người dùng tải lên. ${hasImages ? `Có ${referenceImages!.length} tệp/hình ảnh đính kèm (bao gồm PDF hoặc công thức).` : ''}
  
  **CÁCH SỬ DỤNG TÀI LIỆU THAM KHẢO:**
  - Sử dụng CHÍNH XÁC NGUYÊN VĂN các câu hỏi có sẵn trong tài liệu tham khảo nếu phù hợp với ma trận, đặc tả.
  - Ưu tiên lấy nguyên văn câu hỏi thay vì tạo mới.
  - Chỉ tạo câu hỏi MỚI khi tài liệu tham khảo không đủ câu cho một dạng/mức độ cụ thể.
  ${hasImages ? '- Đọc KỸ các tệp/hình ảnh đính kèm — đặc biệt là hình công thức, hình thí nghiệm. Chép lại công thức bằng thẻ <sub>, <sup>; hình cần giữ thì dùng thẻ figure-json.' : ''}
  
  **NỘI DUNG TÀI LIỆU THAM KHẢO:**
  ${safeText.substring(0, 15000)}
  ${safeText.length > 15000 ? '\n[... Nội dung đã được cắt ngắn do quá dài ...]' : ''}
  
  **===== HẾT TÀI LIỆU THAM KHẢO =====**
  `;
    }
  }

  const matrixSection = matrixContent && matrixContent.trim().length > 0
    ? `\n  Dựa trên **Ma trận đề kiểm tra** ${isUploadedMatrix ? '(Ma trận gốc do người dùng tải lên - BẮT BUỘC TUÂN THỦ 100%)' : ''} sau (HTML):\n  ${matrixContent}\n`
    : '';

  const prompt = `
  **===== THÔNG TIN ĐỀ THI BẮT BUỘC (CỰC KỲ QUAN TRỌNG) =====**
  - **Môn học:** ${inputData.subject}
  - **Khối lớp:** Lớp ${inputData.grade}
  - **Loại đề:** ${inputData.examType}
  - **Thời gian:** ${inputData.duration} phút

  **===== RÀNG BUỘC MÔN HỌC & PHẠM VI KIẾN THỨC =====**
  - TUYỆT ĐỐI CHỈ tạo câu hỏi về nội dung **môn ${inputData.subject} lớp ${inputData.grade}** theo đúng các Chủ đề/Bài học có trong Ma trận và Bảng đặc tả bên dưới.
  - KHÔNG ĐƯỢC tạo câu hỏi thuộc môn học khác hoặc nằm ngoài các đơn vị kiến thức của Ma trận & Bảng đặc tả.
  ${matrixSection}
  Và dựa trên **Bảng đặc tả đề kiểm tra** sau (HTML):
  ${specsContent}

  ${referenceSection}

  Hãy soạn thảo **ĐỀ THI HOÀN CHỈNH** và **HƯỚNG DẪN CHẤM** cho môn **${inputData.subject}** lớp **${inputData.grade}** — **${inputData.examType}**.
  
  ${structureInstructions}

  **YÊU CẦU OUTPUT:**
  1. Xuất ra một **Full HTML Document** (<!DOCTYPE html>...). 
  2. **Style CSS (Include in <style>):**
     - body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.5; color: #000; }
     - h3, h4 { text-align: center; font-weight: bold; margin-top: 20px; }
     - p { margin-bottom: 10px; }
     - .question-number { font-weight: bold; }
     - .options { margin-left: 20px; }
     - .option-item { margin-bottom: 5px; }
     - .answer-table { width: 100%; border-collapse: collapse; margin: 10px 0 18px 0; font-family: "Times New Roman", serif; font-size: 13pt; }
     - .answer-table th, .answer-table td { border: 1px solid #000; padding: 6px 8px; vertical-align: middle; }
     - .answer-table th { font-weight: bold; background-color: #f2f2f2; text-align: center; }
     - .answer-table td.center { text-align: center; }
     - .answer-table td.left { text-align: left; }

  **QUY TẮC FORMAT NGHIÊM NGẶT ĐỂ XUẤT WORD:**
  
  1. **KHÔNG VIẾT PHẦN ĐẦU ĐỀ:** Không viết tên Sở, tên trường, tiêu đề đề thi, họ tên, số báo danh, mã đề, dòng nguyên tử khối và dòng kí hiệu (app tự chèn đúng mẫu của giáo viên). Nội dung trong <body> bắt đầu THẲNG bằng tiêu đề "PHẦN I." (hoặc phần đầu tiên có trong whitelist). Kết thúc phần câu hỏi bằng dòng <p style="text-align:center;font-weight:bold;">--- HẾT ---</p>, sau đó mới đến phần ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI.
  2. **PHẦN:** Mỗi phần có tiêu đề in đậm kèm lệnh chung, ví dụ "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu 18. Mỗi câu hỏi thí sinh chỉ chọn một phương án." Mỗi phần đánh số lại từ Câu 1. Tiêu đề khu vực đáp án ghi đúng "ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI".
  3. **CÂU HỎI TRẮC NGHIỆM:**
     - Sử dụng thẻ <p> cho mỗi câu hỏi.
     - Bắt đầu: <span class="question-number">Câu X.</span> Nội dung...
     - Các đáp án A, B, C, D phải được ngắt dòng rõ ràng (dùng <br> hoặc <div class="option-item">).
     - **VÍ DỤ:**
       <p><span class="question-number">Câu 1.</span> Công thức hóa học của chromium(III) sulfate là</p>
       <div class="options">
         <div class="option-item">A. CrSO<sub>4</sub>.</div>
         <div class="option-item">B. Cr<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>.</div>
         <div class="option-item">C. K<sub>2</sub>Cr<sub>2</sub>O<sub>7</sub>.</div>
         <div class="option-item">D. Cr<sub>2</sub>S<sub>3</sub>.</div>
       </div>
       <br> <!-- Dòng trống giữa các câu -->

  4. **LOGIC DẠNG II (Đúng/Sai):**
     - Nếu Bảng đặc tả ghi **C13a,b** (hoặc **II.1a, II.1b**) ở Biết và **C13c** ở Hiểu, **C13d** ở VD, hãy gộp thành **MỘT CÂU DUY NHẤT** có đề dẫn chung và đủ **4 ý lệnh hỏi a), b), c), d)**.
     - Ví dụ:
       <p><span class="question-number">Câu 1.</span> Thủy phân chất béo X bằng dung dịch NaOH đun nóng... Mỗi phát biểu sau đúng hay sai?</p>
       <div class="options">
         <div class="option-item">a) Hợp chất Y có tên gọi là glycerol.</div>
         <div class="option-item">b) Phổ IR của X có tín hiệu đặc trưng của liên kết C=O.</div>
         <div class="option-item">c) Hydrogen hóa hoàn toàn X thu được chất béo no.</div>
         <div class="option-item">d) Muối thu được có phần ưa nước và phần kị nước.</div>
       </div>

  5. **ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (ĐẶC BIỆT CHÚ Ý KHI XUẤT RA FILE WORD):**
     - Phải trình bày đầy đủ đáp án cho tất cả các phần có trong đề thi bằng bảng HTML có khung viền rõ ràng (\`<table class="answer-table" border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; width: 100%;">\`).
     - **ĐỐI VỚI PHẦN I (Trắc nghiệm nhiều lựa chọn - nếu có):**
       + Lập bảng đáp án nhanh Phần I (hàng Câu 1, 2, 3... và hàng Đáp án A, B, C, D).
     - **⚠️ ĐỐI VỚI PHẦN II — TRẮC NGHIỆM ĐÚNG - SAI (Đ/S) (BẮT BUỘC TUÂN THỦ 100%):**
       + Mỗi câu hỏi Đúng - Sai gồm **4 ý lệnh hỏi (a, b, c, d)** tương ứng với **4 đáp án (Đ hoặc S)**.
       + Trong phần Đáp án / Hướng dẫn giải của Phần II, **BẮT BUỘC PHẢI CÓ BẢNG THÔNG TIN HƯỚNG DẪN GIẢI VÀ 4 ĐÁP ÁN** theo đúng 2 bảng chuẩn dưới đây để khi xuất ra file Word hiển thị đầy đủ:
       
       **(a) Bảng tổng hợp 4 đáp án Đúng - Sai (Đ/S) cho từng câu:**
       <table class="answer-table" border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; width: 100%;">
         <thead>
           <tr>
             <th style="width: 20%; text-align: center;">Câu</th>
             <th style="width: 20%; text-align: center;">Ý a)</th>
             <th style="width: 20%; text-align: center;">Ý b)</th>
             <th style="width: 20%; text-align: center;">Ý c)</th>
             <th style="width: 20%; text-align: center;">Ý d)</th>
           </tr>
         </thead>
         <tbody>
           <tr>
             <td class="center" style="text-align: center; font-weight: bold;">Câu 1</td>
             <td class="center" style="text-align: center; font-weight: bold;">Đ</td>
             <td class="center" style="text-align: center; font-weight: bold;">S</td>
             <td class="center" style="text-align: center; font-weight: bold;">Đ</td>
             <td class="center" style="text-align: center; font-weight: bold;">S</td>
           </tr>
         </tbody>
       </table>

       **(b) Bảng thông tin hướng dẫn giải chi tiết và 4 đáp án (a, b, c, d) cho từng câu Đúng - Sai:**
       <table class="answer-table" border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; width: 100%;">
         <thead>
           <tr>
             <th style="width: 12%; text-align: center;">Câu</th>
             <th style="width: 10%; text-align: center;">Ý</th>
             <th style="width: 15%; text-align: center;">Đáp án (Đ/S)</th>
             <th style="width: 63%; text-align: center;">Hướng dẫn giải chi tiết</th>
           </tr>
         </thead>
         <tbody>
           <tr>
             <td rowspan="4" class="center" style="text-align: center; font-weight: bold;">Câu 1</td>
             <td class="center" style="text-align: center; font-weight: bold;">a)</td>
             <td class="center" style="text-align: center; font-weight: bold;">Đ</td>
             <td class="left" style="text-align: left;">Giải thích / trình bày lời giải chi tiết vì sao ý a) Đúng...</td>
           </tr>
           <tr>
             <td class="center" style="text-align: center; font-weight: bold;">b)</td>
             <td class="center" style="text-align: center; font-weight: bold;">S</td>
             <td class="left" style="text-align: left;">Giải thích / trình bày lời giải chi tiết vì sao ý b) Sai...</td>
           </tr>
           <tr>
             <td class="center" style="text-align: center; font-weight: bold;">c)</td>
             <td class="center" style="text-align: center; font-weight: bold;">Đ</td>
             <td class="left" style="text-align: left;">Giải thích / trình bày lời giải chi tiết vì sao ý c) Đúng...</td>
           </tr>
           <tr>
             <td class="center" style="text-align: center; font-weight: bold;">d)</td>
             <td class="center" style="text-align: center; font-weight: bold;">S</td>
             <td class="left" style="text-align: left;">Giải thích / trình bày lời giải chi tiết vì sao ý d) Sai...</td>
           </tr>
         </tbody>
       </table>
       *(Lặp lại đủ 4 dòng a, b, c, d cho mọi câu hỏi thuộc Phần II. TUYỆT ĐỐI KHÔNG bỏ sót bất kỳ đáp án nào trong 4 đáp án a, b, c, d và KHÔNG bỏ trống cột Hướng dẫn giải chi tiết).*

     - **ĐỐI VỚI PHẦN III (Trả lời ngắn - nếu có):**
       + Lập bảng gồm các cột: Câu | Đáp án | Hướng dẫn giải chi tiết.
     - **ĐỐI VỚI PHẦN IV (Tự luận - nếu có):**
       + Lập bảng Hướng dẫn chấm gồm các cột: Câu | Nội dung / Hướng dẫn giải chi tiết | Điểm.

  **NGUYÊN TẮC CHUNG (BẮT BUỘC TUÂN THỦ):**
  1. **⛔ CẤM TẠO PHẦN THỪA (QUAN TRỌNG NHẤT):** Đề thi CHỈ ĐƯỢC CHỨA các phần có trong WHITELIST ở trên: [${allowedParts.join(', ')}].${contract?.sections ? '' : ' Nếu PHẦN IV (Tự luận) KHÔNG có trong whitelist → TUYỆT ĐỐI KHÔNG tạo câu tự luận, không tạo tiêu đề "PHẦN IV", không nhắc đến tự luận.'}
${CHEM_EXAM_RULES}
  3. **LƯU Ý MÔN HỌC:** Toàn bộ câu hỏi PHẢI thuộc phạm vi kiến thức môn ${inputData.subject} lớp ${inputData.grade}. KHÔNG được ra câu hỏi thuộc môn khác.
  4. **KIỂM TRA CUỐI CÙNG:** Trước khi trả output, hãy tự kiểm tra:
     - Đề thi có chứa phần nào KHÔNG nằm trong whitelist không? Nếu có → XÓA phần đó.
      - Phần Đáp án Đúng - Sai (Đ/S) đã có đủ bảng 4 đáp án (a, b, c, d) và bảng thông tin hướng dẫn giải chi tiết cho cả 4 ý chưa? Nếu chưa → BỔ SUNG đầy đủ.
  ${FIGURE_JSON_HTML_INSTRUCTIONS}
  ${isGraduationExam(inputData) ? TN_THPT_BLUEPRINT : ''}
  `;

  return callWithFallback(async (ai, model) => {
    // Build content parts
    const parts: any[] = [];

    // Add reference images first (if any) — Gemini can "see" these
    if (referenceImages && referenceImages.length > 0) {
      // Limit to max 15 images to avoid token overflow
      const imagesToSend = referenceImages.slice(0, 15);
      console.log(`[ExamCraft] Sending ${imagesToSend.length} reference images to Gemini`);

      for (const img of imagesToSend) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          }
        });
      }
    }

    // Add text prompt
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: createGeminiConfig({
        model,
        systemInstruction: getSystemInstruction(isUploadedMatrix),
        thinkingLevel: ThinkingLevel.MEDIUM,
        maxOutputTokens: 32768,
        temperature: 0.7,
      }),
    });
    const text = response.text || "Lỗi tạo đề thi.";
    const cleaned = text.replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
    return { raw: wasTruncated(response) ? cleaned + TRUNCATION_MARKER : cleaned, contract, counts };
  });
};

/** Sửa đề theo danh sách lỗi cụ thể do bộ kiểm tra phát hiện (1 lần). */
export const repairStep3Exam = async (
  rawExamHtml: string,
  issues: ExamIssue[],
  inputData: InputData,
  structureBlock: string,
  isUploadedMatrix: boolean = false
): Promise<string> => {
  const prompt = `
  Đề kiểm tra (HTML) dưới đây của môn **${inputData.subject}** lớp **${inputData.grade}** (${inputData.examType}) đã được máy kiểm tra và phát hiện các lỗi cấu trúc sau:
  ${issues.map(i => `- ${i.message}`).join('\n  ')}

  ${structureBlock}

  **NHIỆM VỤ:** Trả về TOÀN BỘ đề đã sửa (Full HTML Document), sao cho hết các lỗi trên:
  - Giữ nguyên các câu đã đúng (nội dung, công thức hóa học, các thẻ <script type="application/json" class="figure-json"> nếu có).
  - Bổ sung câu/ý/phương án còn thiếu, xoá câu/phần thừa, đánh số lại Câu 1, Câu 2… liên tục trong từng phần.
  - Cập nhật phần ĐÁP ÁN / HƯỚNG DẪN CHẤM cho khớp đề sau khi sửa.
  - Chỉ trả về HTML, không giải thích.

  **ĐỀ CẦN SỬA:**
  ${rawExamHtml.replace(TRUNCATION_MARKER, '')}
  `;
  return callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: createGeminiConfig({
        model,
        systemInstruction: getSystemInstruction(isUploadedMatrix),
        thinkingLevel: ThinkingLevel.MEDIUM,
        maxOutputTokens: 32768,
        temperature: 0.2,
      }),
    });
    const text = (response.text || '').replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
    return wasTruncated(response) ? text + TRUNCATION_MARKER : text;
  });
};

export interface ExamGenerationResult {
  html: string;
  issues: ExamIssue[];
  repaired: boolean;
  usedContract: boolean;
  /** Số câu đã được AI giải lại độc lập; null nếu không chạy được bước này */
  verifiedCount: number | null;
  /** Câu Trả lời ngắn được chèn thêm câu lệnh làm tròn */
  roundingAdded: number[];
}

const issueScore = (issues: ExamIssue[]) => issues.reduce((s, i) => s + (i.severity === 'error' ? 10 : 1), 0);

/** Chuẩn hóa trình bày hóa học và câu lệnh làm tròn trên bản đề thô của AI. */
const polishChemExam = (raw: string) => {
  const normalized = normalizeChemText(raw);
  return enforceShortAnswerRounding(normalized);
};

interface SolverAnswer {
  part: 'I' | 'II' | 'III';
  num: number;
  answer: string;
  doubt?: string;
}

/**
 * BỘ GIẢI KIỂM CHỨNG: đưa riêng phần đề (không có đáp án) cho AI giải lại độc lập rồi so với đáp án đã ghi.
 * Sai khác → thành lỗi để bước tự sửa xử lí. AI có thể sai nên kết quả là tín hiệu kiểm tra, không phải chứng minh.
 */
export const verifyExamAnswers = async (examHtml: string, inputData: InputData): Promise<{ checked: number; issues: ExamIssue[] }> => {
  const { exam } = splitExamAndKey(examHtml);
  const parsed = parseExamForShuffle(examHtml);
  const prompt = `
  Bạn là giám khảo Hóa học. Dưới đây là đề môn Hóa học lớp ${inputData.grade}, CHƯA có đáp án. Hãy TỰ GIẢI từng câu, không đoán.
  Với bài định lượng: tính từng bước theo bảo toàn khối lượng, bảo toàn nguyên tố, bảo toàn electron, bảo toàn điện tích; thể tích mol khí ở điều kiện chuẩn là 24,79 L/mol; làm tròn đúng như đề dặn.
  Trả về JSON là mảng các phần tử {"part": "I"|"II"|"III", "num": số câu, "answer": đáp án, "doubt": ghi chú nếu đề có vấn đề}:
  - Phần I: "answer" là A, B, C hoặc D.
  - Phần II: "answer" là 4 chữ Đ/S theo thứ tự a b c d, ví dụ "ĐSĐS".
  - Phần III: "answer" là đáp số, dấu phẩy thập phân.
  Chỉ ghi "doubt" khi có lỗi thật: số mol lẻ vô lý, không bảo toàn điện tích, thiếu dữ kiện, nhiều đáp án đúng, không có đáp án đúng.
  Bỏ qua phần tự luận.

  ĐỀ:
  ${exam.replace(/<head\b[\s\S]*?<\/head>/i, '')}
  `;
  const answers = await callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: createGeminiConfig({
        model,
        systemInstruction: 'Bạn là chuyên gia Hóa học THPT, giải chính xác và chỉ trả về JSON.',
        responseMimeType: 'application/json',
        thinkingLevel: ThinkingLevel.HIGH,
        maxOutputTokens: 16384,
        temperature: 0,
      }),
    });
    return JSON.parse((response.text || '[]').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')) as SolverAnswer[];
  });

  const issues: ExamIssue[] = [];
  const clean = (v: string) => String(v ?? '').toUpperCase().replace(/\s+/g, '').replace(/ĐÚNG/g, 'Đ').replace(/SAI/g, 'S');
  const sameNumber = (a: string, b: string) => {
    const x = parseFloat(a.replace(',', '.'));
    const y = parseFloat(b.replace(',', '.'));
    return a === b || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-9);
  };
  let checked = 0;
  (Array.isArray(answers) ? answers : []).forEach(item => {
    const label = `Phần ${item.part} câu ${item.num}`;
    let recorded: string | undefined;
    if (item.part === 'I') recorded = parsed.answers.mc[item.num];
    if (item.part === 'II') {
      const row = parsed.answers.tf[item.num];
      recorded = row ? ['a', 'b', 'c', 'd'].map(l => (row as Record<string, string>)[l] || '').join('') : undefined;
    }
    if (item.part === 'III') recorded = parsed.answers.short[item.num];
    if (item.doubt && item.doubt.trim()) {
      issues.push({ code: 'SOLVER_DOUBT', message: `${label}: ${item.doubt.trim()}`, severity: 'warning' });
    }
    if (!recorded) return;
    checked++;
    const a = clean(item.answer);
    const b = clean(recorded);
    if (item.part === 'III' ? !sameNumber(a, b) : a !== b) {
      issues.push({ code: 'SOLVER_MISMATCH', message: `${label}: đáp án ghi "${recorded}" nhưng giải lại ra "${item.answer}". Hãy giải lại câu này từng bước, sửa số liệu hoặc đáp án cho đúng.`, severity: 'error' });
    }
  });
  return { checked, issues };
};

/**
 * Sinh đề + KIỂM TRA HẬU SINH bằng code + kiểm chứng đáp án + tự sửa 1 lần nếu có lỗi.
 * Trả về cả danh sách lỗi còn lại để giao diện hiển thị cho người dùng.
 */
export const generateStep3ExamChecked = async (
  specsContent: string,
  questionConfig: QuestionConfig,
  inputData: InputData,
  referenceText?: string,
  referenceImages?: { base64: string; mimeType: string }[],
  extractedQuestions?: ExtractedQuestion[],
  referenceMode: ReferenceUsageMode = 'exact',
  matrixContent?: string,
  isUploadedMatrix: boolean = false,
  verifyAnswers: boolean = true
): Promise<ExamGenerationResult> => {
  const args = [specsContent, questionConfig, inputData, referenceText, referenceImages, extractedQuestions, referenceMode, matrixContent, isUploadedMatrix] as const;
  const first = await generateStep3ExamRaw(...args);
  const { contract, counts } = first;
  let { html: raw, added: roundingAdded } = polishChemExam(first.raw);
  // Ma trận tải lên mà không đọc được số liệu → không áp số câu (có thể sai), chỉ kiểm tra định dạng
  const expect = contract?.sections
    // Ma trận theo kĩ năng: kiểm tra tổng số câu + định dạng (phần đặt tên theo kĩ năng, không theo Dạng I–IV)
    ? { counts: null, total: contract.sections.reduce((n, sec) => n + sec.questions.length, 0) }
    : {
      counts: isUploadedMatrix && !contract ? null : { I: counts.type1, II: counts.type2, III: counts.type3, IV: counts.essay },
    };

  // Kiểm chứng đáp án: lỗi mạng hoặc hết lượt không được làm hỏng đề đã sinh
  let verifiedCount: number | null = null;
  const solve = async (html: string): Promise<ExamIssue[]> => {
    if (!verifyAnswers) return [];
    try {
      const { checked, issues: solverIssues } = await verifyExamAnswers(html, inputData);
      verifiedCount = checked;
      return solverIssues;
    } catch (err) {
      console.warn('[ExamCraft] Bước kiểm chứng đáp án không chạy được:', err);
      verifiedCount = null;
      return [{ code: 'SOLVER_SKIPPED', message: 'Chưa kiểm chứng được đáp án bằng AI (lỗi kết nối hoặc hết lượt). Hãy tự rà các câu định lượng.', severity: 'warning' }];
    }
  };
  const inspect = (html: string) => [...validateExamHtml(html, expect), ...checkChemistryExam(html)];

  let issues = [...inspect(raw), ...(await solve(raw))];
  let repaired = false;

  if (hasBlockingIssues(issues)) {
    try {
      let candidate: string;
      if (issues.some(i => i.code === 'TRUNCATED')) {
        // Bị cắt do quá dài → sinh lại với lời giải ngắn gọn
        candidate = (await generateStep3ExamRaw(...args, { concise: true })).raw;
      } else {
        const block = contract
          ? buildContractStructureInstructions(contract)
          : expect.counts
            ? `Cấu trúc yêu cầu: ${QTYPES.filter(t => expect.counts![t] > 0).map(t => `Phần ${t} (${TYPE_LABEL[t]}): ${expect.counts![t]} câu`).join('; ')}. Không có phần nào khác.`
            : 'Cấu trúc yêu cầu: đúng như Ma trận / Bảng đặc tả đã cung cấp (đủ 4 phương án A–D cho Phần I, đủ 4 ý a–d cho Phần II, có đáp án).';
        candidate = await repairStep3Exam(raw, issues, inputData, block, isUploadedMatrix);
      }
      const polished = polishChemExam(candidate);
      const hadSolverError = issues.some(i => i.code === 'SOLVER_MISMATCH');
      const candidateIssues = [...inspect(polished.html), ...(hadSolverError ? await solve(polished.html) : issues.filter(i => i.code.startsWith('SOLVER')))];
      if (issueScore(candidateIssues) < issueScore(issues)) {
        raw = polished.html;
        roundingAdded = polished.added;
        issues = candidateIssues;
        repaired = true;
      }
    } catch (err) {
      console.warn('[ExamCraft] Tự sửa đề thất bại, giữ bản đầu tiên:', err);
    }
  }

  const withHeader = applyExamHeader(raw.replace(TRUNCATION_MARKER, ''), getExamHeaderProfile(), {
    examType: inputData.examType,
    grade: inputData.grade,
    duration: inputData.duration,
  });
  return { html: renderFiguresInHtml(withHeader), issues, repaired, usedContract: !!contract, verifiedCount, roundingAdded };
};

/**
 * Biến thể số liệu tương đương (chống quay cóp): giữ nguyên đề, chỉ đổi số liệu Phần II và Phần III rồi tính lại đáp án.
 */
export const generateNumericVariant = async (examHtml: string, inputData: InputData, index: number): Promise<string> => {
  const prompt = `
  Dưới đây là một đề Hóa học (HTML) kèm đáp án. Hãy tạo BIẾN THỂ SỐ ${index} tương đương về độ khó:
  - Phần I, Phần IV và mọi phần đầu đề: GIỮ NGUYÊN từng chữ.
  - Phần II và Phần III: giữ nguyên dạng câu, nhóm chất và lối hỏi; CHỈ ĐỔI số liệu (khối lượng, thể tích, nồng độ, hiệu suất, số mol) sao cho hợp lí về hóa học. Câu không có số liệu thì giữ nguyên.
  - Tính lại toàn bộ đáp án và hướng dẫn giải theo số liệu mới; mệnh đề Đúng/Sai có thể đổi đáp án nhưng phải chứng minh lại.
  - Đáp án Phần III vẫn tối đa 4 kí tự, dấu phẩy thập phân, giữ câu lệnh làm tròn.
  - Giữ nguyên cấu trúc HTML, số câu, số ý, thẻ figure-json và phần ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI. Chỉ trả về HTML.

  ${CHEM_EXAM_RULES}

  ĐỀ GỐC:
  ${examHtml.replace(/<img\b[^>]*data-figure-svg-b64=[^>]*>/gi, '[HÌNH GIỮ NGUYÊN]')}
  `;
  const out = await callWithFallback(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: createGeminiConfig({
        model,
        systemInstruction: getSystemInstruction(false),
        thinkingLevel: ThinkingLevel.MEDIUM,
        maxOutputTokens: 32768,
        temperature: 0.5,
      }),
    });
    if (wasTruncated(response)) throw new UserFacingError('Biến thể số liệu quá dài nên bị cắt. Vui lòng thử lại hoặc chọn model Pro.');
    return (response.text || '').replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
  });
  // Hình trong đề gốc đi cùng câu: đặt lại ảnh theo thứ tự xuất hiện
  const figures = examHtml.match(/<img\b[^>]*data-figure-svg-b64=[^>]*>/gi) || [];
  let figureIndex = 0;
  return renderFiguresInHtml(polishChemExam(out.replace(/\[HÌNH GIỮ NGUYÊN\]/g, () => figures[figureIndex++] || '')).html);
};

/** Giữ API cũ: chỉ trả về HTML đề (đã kiểm tra + tự sửa). */
export const generateStep3Exam = async (
  ...args: Parameters<typeof generateStep3ExamChecked>
): Promise<string> => (await generateStep3ExamChecked(...args)).html;
