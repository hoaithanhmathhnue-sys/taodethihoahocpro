
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, AppMode, InputData, GenerationState, Lesson, Chapter, QuestionConfig, ExtractedQuestion, MatrixTemplate, ExamHistoryItem, ReferenceUsageMode, ReferenceDocItem, DungSaiLevel, DEFAULT_DUNG_SAI_LEVELS, getDungSaiQuestionCount, getDungSaiLevelConfigs } from './types';
import StepIndicator from './components/StepIndicator';
import Button from './components/Button';
import MarkdownView from './components/MarkdownView';
import ChemFigurePanel from './components/ChemFigurePanel';
import ExamPackagePanel from './components/ExamPackagePanel';
import SimilarExamPage from './components/SimilarExamPage';
import VariantsExamPage from './components/VariantsExamPage';

import { generateStep1Matrix, generateStep2Specs, generateStep3ExamChecked, extractInfoFromDocument, convertMatrixFileToHtml, convertMatrixTextToHtml, extractQuestionsFromReference, getApiKey, isValidApiKey, setApiKey as saveApiKey, getSelectedModel, setSelectedModel, getAiProvider, setAiProvider, getFallbackNotice, setFallbackNotice, subscribeFallbackNotice } from './services/geminiService';
import { parseDocxWithMath, extractQuestionsLocally, extractDocxTablesAndHtml, splitMatrixAndSpecsHtml, isLegacyBinaryDoc } from './services/docxMathParser';
import { resolveContracts, ResolvedContracts, summarizeContract, sameSubject, fmtNum, QTYPES } from './services/matrixContract';
import type { ExamIssue } from './services/examValidator';
import MathFormatSelect from './components/MathFormatSelect';
import ShuffleExamPanel from './components/ShuffleExamPanel';
import { exportToDoc } from './services/exportUtils';
import { buildLevelOf } from './services/examPackage';
import { DEFAULT_HEADER_PROFILE, ExamHeaderProfile, getExamHeaderProfile, saveExamHeaderProfile } from './services/examLayout';
import { APP_INFO, CHEMISTRY_GRADES, CHEMISTRY_SUBJECT, TEXTBOOK_NAME } from './data/appInfo';
import { getAllChemistryChapters, getChemistryChapters } from './data/chemistryCurriculum';
import { actualLevelPercent, buildQuestionConfig, DEFAULT_LEVEL_RATIO, examTypeForPreset, EXAM_PRESETS, ExamPreset, getPreset, LevelRatio, RATIO_SHORTCUTS } from './data/examPresets';
import { GEMINI_MODELS, AGENT_PLATFORM_MODELS, DEFAULT_GEMINI_MODEL, DEFAULT_AGENT_PLATFORM_MODEL, AiProvider } from './constants';
import { ArrowRight, ArrowLeft, RotateCcw, FileText, Download, AlertCircle, Upload, Clock, Check, ChevronDown, ChevronRight, Filter, FileUp, Settings, Key, ExternalLink, Sun, Moon, X, Paperclip, Trash2, BookOpen, Copy, Shuffle, Sparkles, Layers, Zap, History, Save, Eye, FlaskConical } from 'lucide-react';

const DEFAULT_PRESET_ID = 'dinh-ky';
const DEFAULT_SEMESTER_EXAM = 'Giữa kỳ 1';
const DEFAULT_GRADE = '10';

/** Dữ liệu ban đầu: môn Hóa học, cấu trúc đề định kỳ, chương trình Kết nối tri thức. */
const buildInitialInput = (): InputData => {
  const preset = getPreset(DEFAULT_PRESET_ID)!;
  return {
    subject: CHEMISTRY_SUBJECT,
    grade: DEFAULT_GRADE,
    duration: preset.duration,
    examType: DEFAULT_SEMESTER_EXAM,
    topics: '',
    additionalNotes: '',
    chapters: getChemistryChapters(DEFAULT_GRADE),
    questionConfig: buildQuestionConfig(preset, DEFAULT_LEVEL_RATIO),
  };
};

/** Lọc bài theo kỳ kiểm tra dựa vào tuần học. */
const lessonIdsForExam = (type: string, chapters: Chapter[]): Set<string> => {
  const selection = new Set<string>();
  chapters.forEach(chap => {
    chap.lessons.forEach(lesson => {
      const end = lesson.weekEnd || 99; // Default to late if unknown
      const start = lesson.weekStart || 0;
      let shouldSelect = false;
      if (type.includes('Giữa kỳ 1')) shouldSelect = end <= 10;
      else if (type.includes('Cuối kỳ 1')) shouldSelect = end <= 18;
      else if (type.includes('Giữa kỳ 2')) shouldSelect = start >= 19 && end <= 27;
      else if (type.includes('Cuối kỳ 2')) shouldSelect = start >= 19; // Chỉ HK2 (tuần 19+)
      else if (/tốt\s*nghiệp/i.test(type)) shouldSelect = true; // Đề ôn thi: cả 3 khối
      // Kiểm tra thường xuyên: giáo viên tự chọn bài vừa học
      if (shouldSelect) selection.add(lesson.id);
    });
  });
  return selection;
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.INPUT);
  const [completedSteps, setCompletedSteps] = useState<number>(0);

  // -- App Mode State --
  // Luôn mở app ở trang chủ (chọn chế độ), không nhớ chế độ của lần dùng trước
  const [appMode, setAppMode] = useState<AppMode>('home');

  // -- Data State --
  const [inputData, setInputData] = useState<InputData>(buildInitialInput);

  // -- Thiết lập đề 1 chạm --
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [semesterExam, setSemesterExam] = useState<string>(DEFAULT_SEMESTER_EXAM);
  const [levelRatio, setLevelRatio] = useState<LevelRatio>(DEFAULT_LEVEL_RATIO);
  const [customPoints, setCustomPoints] = useState(() => ({ ...getPreset('thuong-xuyen-to-hop')!.points }));
  const [headerProfile, setHeaderProfile] = useState<ExamHeaderProfile>(getExamHeaderProfile);
  const [verifyAnswers, setVerifyAnswers] = useState(true);

  // -- Dark Mode State --
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('examcraft_dark_mode') === 'true';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('examcraft_dark_mode', String(darkMode));
  }, [darkMode]);

  // Bản cũ lưu cả mật khẩu trong trình duyệt của giáo viên: xóa đi khi mở app
  useEffect(() => {
    ['examcraft_auth', 'examcraft_user', 'examcraft_trial_used'].forEach(key => localStorage.removeItem(key));
  }, []);

  // -- Provider & Selected Model State --
  const [provider, setProviderState] = useState<AiProvider>(getAiProvider());
  const [selectedModel, setSelectedModelState] = useState(() => {
    const currentProvider = getAiProvider();
    const saved = getSelectedModel();
    const validList = currentProvider === 'agent-platform' ? AGENT_PLATFORM_MODELS : GEMINI_MODELS;
    const defaultId = currentProvider === 'agent-platform' ? DEFAULT_AGENT_PLATFORM_MODEL : DEFAULT_GEMINI_MODEL;
    if (saved && validList.some(m => m.id === saved)) {
      return saved;
    }
    return defaultId;
  });
  const [fallbackNotice, setFallbackNoticeState] = useState<string | null>(getFallbackNotice());

  useEffect(() => {
    return subscribeFallbackNotice((msg) => {
      setFallbackNoticeState(msg);
    });
  }, []);

  // -- UI State --
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(() => lessonIdsForExam(DEFAULT_SEMESTER_EXAM, getChemistryChapters(DEFAULT_GRADE)));
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set(getChemistryChapters(DEFAULT_GRADE).map(c => c.id)));

  const [genState, setGenState] = useState<GenerationState>({
    matrix: '',
    specs: '',
    exam: '',
    isLoading: false,
    error: null
  });

  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ startedAt: number; model: string; lessons: number; chars: number } | null>(null);
  const [analyzeNow, setAnalyzeNow] = useState(() => Date.now());
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const matrixTemplate: MatrixTemplate = 'template1';
  const [isUploadedMatrix, setIsUploadedMatrix] = useState<boolean>(false);
  // Hợp đồng số liệu đọc từ Ma trận / Đặc tả tải lên (hiển thị cho người dùng kiểm tra)
  const [contracts, setContracts] = useState<ResolvedContracts | null>(null);
  // Kết quả kiểm tra đề sau khi sinh
  const [examCheck, setExamCheck] = useState<{ issues: ExamIssue[]; repaired: boolean; usedContract: boolean; verifiedCount: number | null; roundingAdded: number[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const matrixUploadRef = useRef<HTMLInputElement>(null); // Ref for Step 2 upload
  const matrixDirectUploadRef = useRef<HTMLInputElement>(null); // Ref for Step 1 direct upload
  const referenceUploadRef = useRef<HTMLInputElement>(null); // Ref for reference doc upload
  const comboMatrixUploadRef = useRef<HTMLInputElement>(null); // Ref for combo shortcut - matrix
  const comboSpecsUploadRef = useRef<HTMLInputElement>(null); // Ref for combo shortcut - specs

  // -- Combo Shortcut State --
  const [comboMatrixFile, setComboMatrixFile] = useState<File | null>(null);
  const [comboSpecsFile, setComboSpecsFile] = useState<File | null>(null);
  const [isComboProcessing, setIsComboProcessing] = useState(false);

  // -- Reference Document State (Hỗ trợ nhiều file + 2 chế độ sử dụng) --
  const [referenceDocs, setReferenceDocs] = useState<ReferenceDocItem[]>([]);
  const [referenceMode, setReferenceMode] = useState<ReferenceUsageMode>('exact');
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [isParsingReference, setIsParsingReference] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [isExtractingQuestions, setIsExtractingQuestions] = useState(false);

  const getCombinedReferenceData = (docs: ReferenceDocItem[] = referenceDocs) => {
    const text = docs
      .filter(d => d.text && d.text.trim())
      .map(d => `=== TÀI LIỆU: ${d.fileName} ===\n${d.text}`)
      .join('\n\n');
    const images = docs.flatMap(d => d.images);
    return { text, images };
  };

  // -- API Key State --
  const [apiKey, setApiKeyState] = useState<string>(getApiKey(getAiProvider()) || '');
  const [apiKeyError, setApiKeyError] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(!getApiKey(getAiProvider()));
  const [tempGeminiKey, setTempGeminiKey] = useState<string>(getApiKey('gemini') || '');
  const [tempAgentPlatformKey, setTempAgentPlatformKey] = useState<string>(getApiKey('agent-platform') || '');

  // -- Exam Creation History State (Max 5 recent items) --
  const HISTORY_STORAGE_KEY = 'examcraft_creation_history';
  const [examHistory, setExamHistory] = useState<ExamHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem('examcraft_creation_history');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  });
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [isCurrentExamSaved, setIsCurrentExamSaved] = useState<boolean>(false);

  const persistExamHistory = (items: ExamHistoryItem[]) => {
    const limited = items.slice(0, 5);
    setExamHistory(limited);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(limited));
    } catch (e) {
      console.warn('[ExamCraft] Không thể lưu lịch sử vào localStorage:', e);
    }
  };

  // --- API Key Handlers ---
  const handleSaveApiKey = () => {
    const geminiKeyClean = tempGeminiKey.trim();
    const agentPlatformKeyClean = tempAgentPlatformKey.trim();

    const activeKey = provider === 'agent-platform' ? agentPlatformKeyClean : geminiKeyClean;
    if (!activeKey) {
      setApiKeyError(`Vui lòng nhập API Key cho ${provider === 'agent-platform' ? 'Agent Platform' : 'Google Gemini'}`);
      return;
    }

    if (!isValidApiKey(activeKey)) {
      setApiKeyError('API Key không hợp lệ. Vui lòng nhập key bắt đầu bằng AIzaSy... hoặc AQ...');
      return;
    }

    const validModels = provider === 'agent-platform' ? AGENT_PLATFORM_MODELS : GEMINI_MODELS;
    const defaultModel = provider === 'agent-platform' ? DEFAULT_AGENT_PLATFORM_MODEL : DEFAULT_GEMINI_MODEL;
    const normalizedModel = validModels.some(m => m.id === selectedModel) ? selectedModel : defaultModel;

    setAiProvider(provider);
    setSelectedModelState(normalizedModel);
    setSelectedModel(normalizedModel);
    if (geminiKeyClean) saveApiKey(geminiKeyClean, 'gemini');
    if (agentPlatformKeyClean) saveApiKey(agentPlatformKeyClean, 'agent-platform');

    setApiKeyState(activeKey);
    setShowApiKeyModal(false);
    setApiKeyError('');
  };

  // --- Handlers ---

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInputData(prev => ({ ...prev, [name]: name === 'duration' ? Number(value) || 0 : value }));
  };

  /** Áp lại toàn bộ thiết lập: số câu, thang điểm, thời gian, chương trình, bài được chọn. */
  const applyExamSetup = (next: { presetId?: string; grade?: string; semesterExam?: string; ratio?: LevelRatio; points?: ExamPreset['points'] }) => {
    const preset = getPreset(next.presetId ?? presetId)!;
    const semester = next.semesterExam ?? semesterExam;
    const ratio = next.ratio ?? levelRatio;
    const grade = preset.allGrades ? '12' : (next.grade ?? inputData.grade ?? DEFAULT_GRADE);
    const points = preset.customPoints ? (next.points ?? customPoints) : preset.points;
    const examType = examTypeForPreset(preset, semester);
    const keepUploadedPlan = !!uploadedFileName && !preset.allGrades && grade === inputData.grade;
    const chapters = keepUploadedPlan ? inputData.chapters : preset.allGrades ? getAllChemistryChapters() : getChemistryChapters(grade);
    setPresetId(preset.id);
    setSemesterExam(semester);
    setLevelRatio(ratio);
    setInputData(prev => ({
      ...prev,
      subject: CHEMISTRY_SUBJECT,
      grade,
      examType,
      duration: preset.duration,
      chapters,
      questionConfig: buildQuestionConfig(preset, ratio, points),
    }));
    if (!keepUploadedPlan) setUploadedFileName(null);
    setExpandedChapterIds(new Set(preset.allGrades ? [] : chapters.map(c => c.id)));
    setSelectedLessonIds(lessonIdsForExam(examType, chapters));
  };

  const updateHeaderProfile = (patch: Partial<ExamHeaderProfile>) => {
    const next = { ...headerProfile, ...patch };
    setHeaderProfile(next);
    saveExamHeaderProfile(next);
  };

  const updateLessonPeriods = (chapterId: string, lessonId: string, periods: number) => {
    setInputData(prev => ({
      ...prev,
      chapters: prev.chapters.map(chap => {
        if (chap.id !== chapterId) return chap;
        const lessons = chap.lessons.map(l => (l.id === lessonId ? { ...l, periods } : l));
        return { ...chap, lessons, totalPeriods: lessons.reduce((sum, l) => sum + (l.periods || 0), 0) };
      }),
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingFile(true);
    setUploadedFileName(file.name);
    setGenState(prev => ({ ...prev, error: null }));
    const startedAt = Date.now();
    setAnalyzeProgress({ startedAt, model: '', lessons: 0, chars: 0 });
    const abortController = new AbortController();
    analyzeAbortRef.current = abortController;

    try {
      const extracted = await extractInfoFromDocument(file, CHEMISTRY_SUBJECT, inputData.grade, {
        signal: abortController.signal,
        onProgress: p => setAnalyzeProgress({ startedAt, ...p }),
      });

      if (!extracted || !extracted.chapters || extracted.chapters.length === 0) {
        throw new Error("AI không tìm thấy thông tin bài học/chủ đề nào trong file này. Hãy đảm bảo file là kế hoạch dạy học (PPCT) hợp lệ.");
      }

      // Fix 3: Validation — cảnh báo nếu AI trả về môn khác với môn đã chọn
      if (extracted.subject && !sameSubject(CHEMISTRY_SUBJECT, extracted.subject)) {
        alert(`⚠️ CẢNH BÁO: App chỉ tạo đề môn Hóa học nhưng AI phát hiện file này có nội dung môn "${extracted.subject}".\n\nVui lòng kiểm tra lại file PPCT đã tải lên.`);
      }

      setInputData(prev => ({
        ...prev,
        subject: CHEMISTRY_SUBJECT,
        grade: prev.grade || extracted.grade || '',
        topics: extracted.topics || prev.topics, // Fallback
        chapters: extracted.chapters || [],
      }));

      // Initialize selection: Expand all chapters, Apply filter
      if (extracted.chapters && extracted.chapters.length > 0) {
        const allChapIds = new Set(extracted.chapters.map(c => c.id));
        setExpandedChapterIds(allChapIds);
        applySmartFilter(inputData.examType, extracted.chapters);
      }

      if (extracted.truncated) {
        alert(`⚠️ File PPCT khá dài nên AI chỉ đọc được đến "${extracted.chapters[extracted.chapters.length - 1]?.name || 'chương cuối trong danh sách'}".\n\nVui lòng kiểm tra danh sách bài học bên dưới. Nếu thiếu bài cần ra đề, hãy xóa bớt phần không cần trong file (ví dụ học kỳ khác) rồi tải lại.`);
      }

    } catch (err: any) {
      if (!abortController.signal.aborted) {
        setGenState(prev => ({ ...prev, error: `Lỗi đọc file: ${err.message}` }));
      }
      setUploadedFileName(null);
    } finally {
      setIsAnalyzingFile(false);
      setAnalyzeProgress(null);
      analyzeAbortRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Đồng hồ đếm giây khi đang phân tích file PPCT
  useEffect(() => {
    if (!isAnalyzingFile) return;
    const timer = setInterval(() => setAnalyzeNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isAnalyzingFile]);

  /**
   * Đồng bộ thông tin từ Ma trận / Đặc tả tải lên bằng HỢP ĐỒNG SỐ LIỆU (đọc mã câu theo cột):
   *  - Số câu từng dạng × mức độ, cấp độ từng ý Đúng – Sai, điểm → lấy đúng theo file.
   *  - Đọc không được → GIỮ NGUYÊN cấu hình hiện tại và cảnh báo (không còn âm thầm dùng cấu hình mặc định,
   *    không còn tự bịa câu tự luận khi thấy chữ "tự luận").
   *  - Môn/Lớp trong file khác lựa chọn trên màn hình → hỏi người dùng thay vì im lặng chọn một bên.
   */
  const applyUploadedContent = (matrixHtml: string, specsHtml: string | null): ResolvedContracts => {
    const resolved = resolveContracts(matrixHtml, specsHtml);
    setContracts(resolved);
    const primary = resolved.primary;
    const meta = { ...(resolved.specs?.meta || {}), ...(resolved.matrix?.meta || {}) };
    console.log('[MatrixUpload] Hợp đồng số liệu:', primary ? summarizeContract(primary) : '(không đọc được)', resolved);

    // App chỉ dành cho môn Hóa học: file môn khác → báo để giáo viên kiểm tra
    const current = inputData;
    if (meta.subject && !sameSubject(CHEMISTRY_SUBJECT, meta.subject)) {
      alert(`⚠️ File tải lên ghi môn ${meta.subject}, trong khi app chỉ tạo đề môn Hóa học. Vui lòng kiểm tra lại file.`);
    }
    const gradeConflict = !!(current.grade && meta.grade && current.grade !== meta.grade);
    let useFile = true;
    if (gradeConflict) {
      useFile = window.confirm(
        `⚠️ File tải lên ghi lớp ${meta.grade}, nhưng màn hình đang chọn lớp ${current.grade}.\n\n` +
        `• Bấm OK để dùng theo FILE (khuyên dùng).\n• Bấm Cancel để giữ lựa chọn trên màn hình.`
      );
    }
    const nextGrade = (useFile ? meta.grade : undefined) || current.grade || meta.grade || '';

    setInputData(prev => ({
      ...prev,
      subject: CHEMISTRY_SUBJECT,
      grade: nextGrade,
      examType: meta.examType || prev.examType,
      duration: meta.duration || prev.duration,
      topics: primary?.topicsSummary || prev.topics,
      questionConfig: primary?.ok && primary.questionConfig ? { ...primary.questionConfig } : prev.questionConfig,
    }));
    return resolved;
  };

  /** Lấy cấu hình số câu đúng theo ma trận/đặc tả hiện tại (kể cả khi người dùng đã sửa bảng trên màn hình). */
  const getEffectiveUploadedConfig = (matrixHtml: string, specsHtml: string | null): QuestionConfig | null => {
    const resolved = resolveContracts(matrixHtml, specsHtml);
    setContracts(resolved);
    return resolved.primary?.ok && resolved.primary.questionConfig ? { ...resolved.primary.questionConfig } : null;
  };

  const requireSubjectAndGrade = (data: InputData): boolean => {
    if (!data.grade) {
      setGenState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Chưa xác định được khối lớp từ file. Vui lòng chọn Lớp ở thanh thông tin phía trên bảng rồi bấm lại.',
      }));
      return false;
    }
    return true;
  };

  /** Đọc 1 file Ma trận / Đặc tả → HTML (Word đọc trực tiếp, PDF/ảnh qua AI). */
  const readTableFile = async (file: File): Promise<{ matrixHtml: string; specsHtml: string | null; hasMatrixTable: boolean }> => {
    const lowerName = file.name.toLowerCase();
    if (file.type === "text/html" || file.type === "text/plain" || lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerName.endsWith(".txt")) {
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });
      // File văn bản không có bảng HTML → nhờ AI dựng bảng
      const html = /<table/i.test(text) ? text : await convertMatrixTextToHtml(text);
      const split = splitMatrixAndSpecsHtml(html);
      return { matrixHtml: split.matrixHtml, specsHtml: split.specsHtml, hasMatrixTable: split.kinds.some(k => k !== 'other') };
    }
    if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
      const arrayBuffer = await file.arrayBuffer();
      if (isLegacyBinaryDoc(arrayBuffer)) {
        throw new Error('File "' + file.name + '" là định dạng Word .doc đời cũ nên không đọc được bảng chính xác. Vui lòng mở bằng Word → "Lưu thành" (Save As) → chọn .docx rồi tải lại (hoặc xuất PDF).');
      }
      const directTable = await extractDocxTablesAndHtml(arrayBuffer);
      if (directTable.hasTable && directTable.matrixHtml) {
        console.log(`[MatrixUpload] Đọc trực tiếp bảng Word: ${directTable.tableKinds.join(', ')} (hasSpecs=${!!directTable.specsHtml})`);
        return { matrixHtml: directTable.matrixHtml, specsHtml: directTable.specsHtml, hasMatrixTable: directTable.hasMatrixTable };
      }
      // Word không có bảng thật (bảng vẽ bằng tab/ảnh) → nhờ AI dựng bảng từ văn bản
      const parsed = await parseDocxWithMath(arrayBuffer);
      console.log(`[MatrixUpload] DOCX không có bảng XML: ${parsed.text.length} ký tự, ${parsed.images.length} ảnh → AI dựng bảng`);
      const html = await convertMatrixTextToHtml(parsed.text, parsed.images);
      const split = splitMatrixAndSpecsHtml(html);
      return { matrixHtml: split.matrixHtml, specsHtml: split.specsHtml, hasMatrixTable: split.kinds.some(k => k !== 'other') };
    }
    // PDF / ảnh → AI chuyển bảng
    const html = await convertMatrixFileToHtml(file);
    const split = splitMatrixAndSpecsHtml(html);
    return { matrixHtml: split.matrixHtml, specsHtml: split.specsHtml, hasMatrixTable: split.kinds.some(k => k !== 'other') };
  };

  // Common logic for processing uploaded matrix file → trả về HTML ma trận (null nếu lỗi)
  const processMatrixUpload = async (file: File): Promise<string | null> => {
    setGenState(prev => ({ ...prev, isLoading: true, error: null }));
    setExamCheck(null);

    try {
      const { matrixHtml, specsHtml } = await readTableFile(file);
      if (!matrixHtml || !/<table/i.test(matrixHtml)) {
        throw new Error('Không tìm thấy bảng Ma trận nào trong file. Vui lòng kiểm tra lại file (bảng phải là bảng thật trong Word, không phải ảnh chụp).');
      }

      applyUploadedContent(matrixHtml, specsHtml);
      setIsUploadedMatrix(true);

      setGenState(prev => ({
        ...prev,
        matrix: matrixHtml,
        // Ma trận mới → bỏ đặc tả/đề cũ (tránh sinh đề theo đặc tả của ma trận trước)
        specs: specsHtml || '',
        exam: '',
        isLoading: false,
      }));
      return matrixHtml;
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isLoading: false, error: err.message }));
      return null;
    }
  };

  const handleMatrixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await processMatrixUpload(file);
    if (matrixUploadRef.current) matrixUploadRef.current.value = '';
  };

  const handleMatrixSkipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const matrixHtml = await processMatrixUpload(file);
    if (matrixHtml) {
      // Skip to Matrix Step (Step 2) immediately
      setCurrentStep(AppStep.MATRIX);
      setCompletedSteps(Math.max(completedSteps, 1));
    }

    if (matrixDirectUploadRef.current) matrixDirectUploadRef.current.value = '';
  };

  // -- Combo Shortcut: Upload cả Ma trận + Đặc tả → Nhảy thẳng sang tạo đề --
  const handleComboMatrixSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComboMatrixFile(file);
    if (comboMatrixUploadRef.current) comboMatrixUploadRef.current.value = '';
  };

  const handleComboSpecsSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComboSpecsFile(file);
    if (comboSpecsUploadRef.current) comboSpecsUploadRef.current.value = '';
  };

  const processComboShortcut = async () => {
    if (!comboMatrixFile || !comboSpecsFile) {
      alert('Vui lòng chọn cả 2 file: Ma trận VÀ Đặc tả.');
      return;
    }

    setIsComboProcessing(true);
    setGenState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      setExamCheck(null);
      // Đọc cả 2 file trước, rồi đồng bộ MỘT lần (tránh hỏi xung đột môn/lớp 2 lần)
      const m = await readTableFile(comboMatrixFile);
      if (!m.matrixHtml || !/<table/i.test(m.matrixHtml)) throw new Error('Không tìm thấy bảng Ma trận trong file Ma trận.');
      const sp = await readTableFile(comboSpecsFile);
      // File đặc tả gộp cả ma trận → lấy phần đặc tả; chỉ có 1 bảng → lấy cả bảng
      const specsContent = sp.specsHtml || sp.matrixHtml;
      if (!specsContent || !/<table/i.test(specsContent)) throw new Error('Không tìm thấy bảng Đặc tả trong file Đặc tả.');

      applyUploadedContent(m.matrixHtml, specsContent);
      setIsUploadedMatrix(true);
      setGenState(prev => ({ ...prev, matrix: m.matrixHtml, specs: specsContent, exam: '', isLoading: false }));

      // Jump to SPECS step → user clicks "Tạo đề" from there
      setCurrentStep(AppStep.SPECS);
      setCompletedSteps(Math.max(completedSteps, 2));

      // Clear combo state
      setComboMatrixFile(null);
      setComboSpecsFile(null);
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isLoading: false, error: err.message }));
    } finally {
      setIsComboProcessing(false);
    }
  };

  // -- Topic Selection Logic --

  const applySmartFilter = (type: string, chapters: Chapter[]) => {
    setSelectedLessonIds(lessonIdsForExam(type, chapters));
  };

  const toggleChapter = (chapId: string, select: boolean) => {
    const chapter = inputData.chapters.find(c => c.id === chapId);
    if (!chapter) return;

    const newSet = new Set(selectedLessonIds);
    chapter.lessons.forEach(l => {
      if (select) newSet.add(l.id);
      else newSet.delete(l.id);
    });
    setSelectedLessonIds(newSet);
  };

  const toggleLesson = (lessonId: string) => {
    const newSet = new Set(selectedLessonIds);
    if (newSet.has(lessonId)) newSet.delete(lessonId);
    else newSet.add(lessonId);
    setSelectedLessonIds(newSet);
  };

  const toggleExpandChapter = (chapId: string) => {
    const newSet = new Set(expandedChapterIds);
    if (newSet.has(chapId)) newSet.delete(chapId);
    else newSet.add(chapId);
    setExpandedChapterIds(newSet);
  };

  // -- Question Config Logic --
  const updateQuestionConfig = (type: 'type1' | 'type2' | 'type3' | 'essay', level: 'biet' | 'hieu' | 'van_dung' | 'van_dung_cao', value: number) => {
    setInputData(prev => ({
      ...prev,
      questionConfig: {
        ...prev.questionConfig,
        [type]: {
          ...prev.questionConfig[type],
          [level]: Math.max(0, isNaN(value) ? 0 : value)
        }
      }
    }));
  };

  // -- Generation Handlers --

  const handleGenerateMatrix = async () => {
    if (selectedLessonIds.size === 0) {
      alert("Vui lòng chọn ít nhất 1 bài học/chủ đề!");
      return;
    }

    setGenState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      setIsUploadedMatrix(false);
      setContracts(null);
      setExamCheck(null);
      const matrix = await generateStep1Matrix(inputData, selectedLessonIds);
      // Tôn trọng cấu hình: nếu người dùng đã đặt tự luận = 0, không auto-set lên
      const userConfigTotalEssay = inputData.questionConfig.essay.biet + inputData.questionConfig.essay.hieu + inputData.questionConfig.essay.van_dung + inputData.questionConfig.essay.van_dung_cao;
      if (userConfigTotalEssay === 0) {
        setInputData(prev => ({
          ...prev,
          questionConfig: {
            ...prev.questionConfig,
            essay: { biet: 0, hieu: 0, van_dung: 0, van_dung_cao: 0 },
          }
        }));
      }
      // Người dùng đã nhập số câu Tự luận > 0 ở bất kỳ cột nào → GIỮ NGUYÊN cấu hình,
      // không reset theo kết quả dò từ khóa trong HTML (nguyên nhân Tự luận "lúc có lúc không").
      setGenState(prev => ({ ...prev, matrix, isLoading: false }));
      setCurrentStep(AppStep.MATRIX);
      setCompletedSteps(Math.max(completedSteps, 1));
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleGenerateSpecs = async () => {
    setGenState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      // Ma trận tải lên: số câu lấy lại trực tiếp từ bảng hiện tại (kể cả khi người dùng đã sửa bảng)
      let effectiveData = inputData;
      if (isUploadedMatrix && genState.matrix) {
        const cfg = getEffectiveUploadedConfig(genState.matrix, null);
        if (cfg) {
          effectiveData = { ...inputData, questionConfig: cfg };
          setInputData(effectiveData);
        }
      }
      if (!requireSubjectAndGrade(effectiveData)) return;
      setExamCheck(null);
      setGenState(prev => ({ ...prev, specs: '', exam: '', isLoading: true, error: null }));
      const specs = await generateStep2Specs(
        genState.matrix,
        effectiveData,
        selectedLessonIds,
        isUploadedMatrix
      );
      // Đối chiếu đặc tả vừa sinh với ma trận → cảnh báo nếu lệch số câu
      if (isUploadedMatrix) setContracts(resolveContracts(genState.matrix, specs));
      setGenState(prev => ({ ...prev, specs, isLoading: false }));
      setCurrentStep(AppStep.SPECS);
      setCompletedSteps(Math.max(completedSteps, 2));
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleGenerateExam = async () => {
    setGenState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      let effectiveData = inputData;
      if (isUploadedMatrix && (genState.matrix || genState.specs)) {
        const cfg = getEffectiveUploadedConfig(genState.matrix, genState.specs || null);
        if (cfg) {
          effectiveData = { ...inputData, questionConfig: cfg };
          setInputData(effectiveData);
        }
      }
      if (!requireSubjectAndGrade(effectiveData)) return;

      // Instant local question extraction if not done yet (no double AI call!)
      const combinedRef = getCombinedReferenceData();
      let questionsToUse = extractedQuestions;
      if (referenceDocs.length > 0 && questionsToUse.length === 0 && combinedRef.text) {
        const localExtracted = extractQuestionsLocally(combinedRef.text);
        if (localExtracted.length > 0) {
          setExtractedQuestions(localExtracted);
          questionsToUse = localExtracted;
        }
      }

      const result = await generateStep3ExamChecked(
        genState.specs,
        { ...effectiveData.questionConfig },
        effectiveData,
        combinedRef.text || undefined,
        combinedRef.images.length > 0 ? combinedRef.images : undefined,
        questionsToUse.length > 0 ? questionsToUse : undefined,
        referenceMode,
        genState.matrix || undefined,
        isUploadedMatrix,
        verifyAnswers
      );
      setExamCheck({ issues: result.issues, repaired: result.repaired, usedContract: result.usedContract, verifiedCount: result.verifiedCount, roundingAdded: result.roundingAdded });
      setGenState(prev => ({ ...prev, exam: result.html, isLoading: false }));
      setCurrentStep(AppStep.EXAM);
      setCompletedSteps(Math.max(completedSteps, 3));
      setIsCurrentExamSaved(false);
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  // -- History Handlers (Lưu 5 lịch sử gần nhất & Tái sử dụng Ma trận/Đặc tả để tạo đề thêm) --
  const buildHistoryTitle = (): string => {
    if (inputData.subject) {
      const gradeStr = inputData.grade ? ` - Lớp ${inputData.grade}` : '';
      const typeStr = inputData.examType ? ` • ${inputData.examType}` : '';
      const durStr = inputData.duration ? ` (${inputData.duration} phút)` : '';
      return `${inputData.subject}${gradeStr}${typeStr}${durStr}`;
    }
    const titleMatch = (genState.exam || genState.specs || genState.matrix).match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]?.trim()) {
      return titleMatch[1].trim();
    }
    return `Đề kiểm tra ${inputData.examType || ''} (${inputData.duration || 45} phút)`.trim();
  };

  const handleSaveHistory = () => {
    if (!genState.exam && !genState.specs) return;
    const createdAt = new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const newItem: ExamHistoryItem = {
      id: `hist_${Date.now()}`,
      createdAt,
      title: buildHistoryTitle(),
      inputData: JSON.parse(JSON.stringify(inputData)),
      matrixTemplate,
      selectedLessonIds: Array.from(selectedLessonIds),
      matrix: genState.matrix,
      specs: genState.specs,
      exam: genState.exam,
      isUploadedMatrix,
    };
    const updated = [newItem, ...examHistory].slice(0, 5);
    persistExamHistory(updated);
    setIsCurrentExamSaved(true);
  };

  const handleGenerateExamFromHistory = async (item: ExamHistoryItem) => {
    setShowHistoryModal(false);
    setAppMode('cv7991');
    setInputData(item.inputData);
    setSelectedLessonIds(new Set(item.selectedLessonIds || []));
    setIsCurrentExamSaved(false);
    setCurrentStep(AppStep.EXAM);
    setCompletedSteps(3);
    setGenState({
      matrix: item.matrix,
      specs: item.specs,
      exam: item.exam,
      isLoading: true,
      error: null,
    });

    setIsUploadedMatrix(!!item.isUploadedMatrix);
    setContracts(item.isUploadedMatrix ? resolveContracts(item.matrix, item.specs) : null);
    setExamCheck(null);
    try {
      const combinedRef = getCombinedReferenceData();
      const result = await generateStep3ExamChecked(
        item.specs || item.matrix,
        { ...item.inputData.questionConfig },
        item.inputData,
        combinedRef.text || undefined,
        combinedRef.images.length > 0 ? combinedRef.images : undefined,
        extractedQuestions.length > 0 ? extractedQuestions : undefined,
        referenceMode,
        item.matrix || undefined,
        !!item.isUploadedMatrix,
        verifyAnswers
      );
      const newExam = result.html;
      setExamCheck({ issues: result.issues, repaired: result.repaired, usedContract: result.usedContract, verifiedCount: result.verifiedCount, roundingAdded: result.roundingAdded });

      setGenState({
        matrix: item.matrix,
        specs: item.specs,
        exam: newExam,
        isLoading: false,
        error: null,
      });
      setCurrentStep(AppStep.EXAM);
      setCompletedSteps(3);
      setIsCurrentExamSaved(false);
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleRestoreHistory = (item: ExamHistoryItem) => {
    setShowHistoryModal(false);
    setIsUploadedMatrix(!!item.isUploadedMatrix);
    setContracts(item.isUploadedMatrix ? resolveContracts(item.matrix, item.specs) : null);
    setExamCheck(null);
    setAppMode('cv7991');
    setInputData(item.inputData);
    setSelectedLessonIds(new Set(item.selectedLessonIds || []));
    setGenState({
      matrix: item.matrix,
      specs: item.specs,
      exam: item.exam,
      isLoading: false,
      error: null,
    });
    setCurrentStep(AppStep.EXAM);
    setCompletedSteps(3);
    setIsCurrentExamSaved(true);
  };

  const handleDeleteHistoryItem = (id: string) => {
    const updated = examHistory.filter(item => item.id !== id);
    persistExamHistory(updated);
  };

  // -- Reference Document Upload Handler (Multi-file + Drag & Drop) --
  const parseSingleReferenceFile = async (file: File): Promise<ReferenceDocItem> => {
    const lowerName = file.name.toLowerCase();
    const id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await parseDocxWithMath(arrayBuffer);
      return {
        id,
        fileName: file.name,
        text: result.text,
        images: result.images,
        method: result.method,
        wmfCount: result.wmfCount,
      };
    }

    if (lowerName.endsWith('.pdf') || file.type === 'application/pdf' || file.type.startsWith('image/')) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || (lowerName.endsWith('.pdf') ? 'application/pdf' : 'image/png');
      return {
        id,
        fileName: file.name,
        text: `[Tài liệu PDF/Hình ảnh đính kèm: ${file.name}]`,
        images: [{ base64, mimeType }],
        method: 'pdf',
        wmfCount: 0,
      };
    }

    // Fallback for .txt / .html
    const textContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = reject;
      reader.readAsText(file);
    });
    return {
      id,
      fileName: file.name,
      text: textContent,
      images: [],
      method: 'text',
      wmfCount: 0,
    };
  };

  const processReferenceFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const t0 = performance.now();
    setIsParsingReference(true);
    setGenState(prev => ({ ...prev, error: null }));

    try {
      // 1. Parse all uploaded files concurrently in parallel (< 30ms)
      const parsedItems = await Promise.all(files.map(file => parseSingleReferenceFile(file)));

      const mergedDocs = [
        ...referenceDocs.filter(existing => !parsedItems.some(p => p.fileName === existing.fileName)),
        ...parsedItems,
      ];
      setReferenceDocs(mergedDocs);

      // Release upload spinner immediately after local file reading finishes
      setIsParsingReference(false);

      const combined = getCombinedReferenceData(mergedDocs);
      // 2. Instant local question extraction (< 5ms, zero API wait time)
      const localQuestions = extractQuestionsLocally(combined.text);
      setExtractedQuestions(localQuestions);

      console.log(
        `[Reference] Fast parsed ${mergedDocs.length} files in ${Math.round(performance.now() - t0)}ms: ${combined.text.length} chars, ${localQuestions.length} questions extracted locally`
      );
    } catch (err: any) {
      setGenState(prev => ({ ...prev, error: `Lỗi đọc file tham khảo: ${err.message}` }));
    } finally {
      setIsParsingReference(false);
      if (referenceUploadRef.current) referenceUploadRef.current.value = '';
    }
  };

  // Optional on-demand AI deep extraction (for scanned PDFs / MathType WMF images)
  const handleDeepAiExtractReference = async () => {
    if (referenceDocs.length === 0 || isExtractingQuestions) return;
    const combined = getCombinedReferenceData(referenceDocs);
    setIsExtractingQuestions(true);
    try {
      const questions = await extractQuestionsFromReference(
        combined.text,
        combined.images,
        genState.specs,
        inputData.subject,
        inputData.grade,
        true
      );
      if (questions.length > 0) {
        setExtractedQuestions(questions);
      }
    } catch (extractErr: any) {
      console.warn('[Reference] Deep AI extraction failed:', extractErr.message);
    } finally {
      setIsExtractingQuestions(false);
    }
  };

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await processReferenceFiles(e.target.files);
  };

  const handleReferenceDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingReference(false);
    if (isParsingReference) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processReferenceFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveReferenceDoc = (id: string) => {
    const remaining = referenceDocs.filter(doc => doc.id !== id);
    setReferenceDocs(remaining);
    if (remaining.length === 0) {
      setExtractedQuestions([]);
    } else {
      const combined = getCombinedReferenceData(remaining);
      setExtractedQuestions(extractQuestionsLocally(combined.text));
    }
  };

  const handleClearAllReferenceDocs = () => {
    setReferenceDocs([]);
    setExtractedQuestions([]);
  };

  const handleDownloadWord = (content: string, fileName: string) =>
    exportToDoc(content, fileName, currentStep === AppStep.EXAM ? { examLayout: true } : { landscape: true });

  /** Nạp đề thi tốt nghiệp mẫu đi kèm app vào tài liệu tham khảo (mặc định chỉ tham khảo dạng câu, không chép). */
  const handleLoadSampleExams = async () => {
    setIsParsingReference(true);
    try {
      const samples = ['De_TN_THPT_2026_ma_0323.docx', 'De_TN_THPT_2026_lan_2_ma_0344.docx'];
      const files = await Promise.all(samples.map(async name => {
        const res = await fetch(`/samples/${name}`);
        if (!res.ok) throw new Error(`không tải được ${name}`);
        return new File([await res.blob()], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      }));
      setReferenceMode('adapt');
      await processReferenceFiles(files);
    } catch (err: any) {
      setGenState(prev => ({ ...prev, error: `Lỗi nạp đề mẫu: ${err.message}` }));
      setIsParsingReference(false);
    }
  };

  // --- Sub-Components for Render ---

  const renderQuestionConfigRow = (
    label: string,
    typeKey: 'type1' | 'type2' | 'type3' | 'essay',
    defaultB: number,
    defaultH: number,
    defaultV: number,
    defaultVC: number = 0
  ) => (
    <div className="grid grid-cols-5 gap-3 items-center py-3 border-b border-teal-50 last:border-0">
      <span className="text-sm font-semibold text-teal-700">{label}</span>
      <div className="flex flex-col">
        <span className="text-xs text-teal-500 mb-1">Biết</span>
        <input
          type="number"
          className="w-full p-2 input-elevated text-center text-sm"
          value={inputData.questionConfig[typeKey].biet}
          onChange={(e) => updateQuestionConfig(typeKey, 'biet', parseInt(e.target.value) || 0)}
          min={0}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-teal-500 mb-1">Hiểu</span>
        <input
          type="number"
          className="w-full p-2 input-elevated text-center text-sm"
          value={inputData.questionConfig[typeKey].hieu}
          onChange={(e) => updateQuestionConfig(typeKey, 'hieu', parseInt(e.target.value) || 0)}
          min={0}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-teal-500 mb-1">Vận dụng</span>
        <input
          type="number"
          className="w-full p-2 input-elevated text-center text-sm"
          value={inputData.questionConfig[typeKey].van_dung}
          onChange={(e) => updateQuestionConfig(typeKey, 'van_dung', parseInt(e.target.value) || 0)}
          min={0}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-teal-500 mb-1">VD cao</span>
        <input
          type="number"
          className="w-full p-2 input-elevated text-center text-sm"
          value={inputData.questionConfig[typeKey].van_dung_cao}
          onChange={(e) => updateQuestionConfig(typeKey, 'van_dung_cao', parseInt(e.target.value) || 0)}
          min={0}
        />
      </div>
    </div>
  );

  const updateDungSaiQuestionCount = (value: number) => {
    const count = Math.max(0, Math.floor(value || 0));
    setInputData(prev => {
      const current = getDungSaiLevelConfigs(prev.questionConfig);
      const configs = Array.from({ length: count }, (_, index) => ({ ...(current[index] || DEFAULT_DUNG_SAI_LEVELS) }));
      return { ...prev, questionConfig: { ...prev.questionConfig, type2QuestionCount: count, dungSaiLevelConfigs: configs } };
    });
  };

  const updateDungSaiLevel = (questionIndex: number, key: keyof typeof DEFAULT_DUNG_SAI_LEVELS, value: DungSaiLevel) => {
    setInputData(prev => {
      const configs = getDungSaiLevelConfigs(prev.questionConfig);
      configs[questionIndex] = { ...configs[questionIndex], [key]: value };
      return { ...prev, questionConfig: { ...prev.questionConfig, dungSaiLevelConfigs: configs } };
    });
  };

  const renderInputStep = () => (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 relative z-10">

      {/* === SHORTCUT SECTION (Moved to top) === */}
      <div className="animate-fade-in-up">
        <div className="space-y-4">
          {/* Shortcut 1: Có file Ma trận */}
          <div className="shortcut-box p-5">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-blue-800">⚡ Lối tắt: Bạn đã có file Ma trận?</h3>
                <p className="text-sm text-blue-600">Tải lên file Ma trận (HTML, Word, PDF) để bỏ qua các bước cấu hình và sinh ngay Bảng đặc tả.</p>
              </div>
              
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <label className="block text-xs font-semibold text-blue-700 mb-1">Khối lớp (môn Hóa học) <span className="text-red-500">*</span></label>
                <select
                  value={inputData.grade}
                  onChange={e => setInputData(prev => ({ ...prev, grade: e.target.value }))}
                  className="w-full sm:w-48 px-2.5 py-2 input-elevated text-sm"
                >
                  {CHEMISTRY_GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-blue-500">✓ Khai báo lớp trước để hệ thống nhận diện chính xác</p>
                <input
                  type="file"
                  ref={matrixDirectUploadRef}
                  onChange={handleMatrixSkipUpload}
                  className="hidden"
                  accept=".html,.txt,.pdf,.docx,.doc"
                />
                <Button
                  variant="secondary"
                  onClick={() => matrixDirectUploadRef.current?.click()}
                  icon={<FileUp className="w-4 h-4" />}
                  className="whitespace-nowrap"
                  isLoading={genState.isLoading && currentStep === AppStep.INPUT && !isComboProcessing}
                >
                  Upload Ma trận & Đi tiếp
                </Button>
              </div>
            </div>
          </div>

          {/* Shortcut 2: Có cả Ma trận + Đặc tả */}
          <div className="shortcut-box p-5" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0f9ff 100%)' }}>
            <div className="flex flex-col gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-emerald-800">🚀 Lối tắt: Bạn đã có file Ma trận + Đặc tả?</h3>
                <p className="text-sm text-emerald-600">Tải lên cả 2 file để nhảy thẳng sang bước tạo đề thi!</p>
              </div>
              
              <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                <label className="block text-xs font-semibold text-emerald-700 mb-1">Khối lớp (môn Hóa học) <span className="text-red-500">*</span></label>
                <select
                  value={inputData.grade}
                  onChange={e => setInputData(prev => ({ ...prev, grade: e.target.value }))}
                  className="w-full sm:w-48 px-2.5 py-2 input-elevated text-sm"
                >
                  {CHEMISTRY_GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Upload Ma trận */}
              <input type="file" ref={comboMatrixUploadRef} onChange={handleComboMatrixSelect} className="hidden" accept=".html,.txt,.pdf,.docx,.doc" />
              <button
                onClick={() => comboMatrixUploadRef.current?.click()}
                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed transition-all text-left ${comboMatrixFile
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/30'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${comboMatrixFile ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                  {comboMatrixFile ? <Check className="w-5 h-5 text-emerald-600" /> : <FileUp className="w-5 h-5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${comboMatrixFile ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {comboMatrixFile ? comboMatrixFile.name : '📋 Chọn file Ma trận'}
                  </p>
                  <p className="text-xs text-slate-400">{comboMatrixFile ? 'Đã chọn · Click để đổi' : 'HTML, Word, PDF'}</p>
                </div>
              </button>

              {/* Upload Đặc tả */}
              <input type="file" ref={comboSpecsUploadRef} onChange={handleComboSpecsSelect} className="hidden" accept=".html,.txt,.pdf,.docx,.doc" />
              <button
                onClick={() => comboSpecsUploadRef.current?.click()}
                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed transition-all text-left ${comboSpecsFile
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/30'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${comboSpecsFile ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                  {comboSpecsFile ? <Check className="w-5 h-5 text-emerald-600" /> : <FileUp className="w-5 h-5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${comboSpecsFile ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {comboSpecsFile ? comboSpecsFile.name : '📝 Chọn file Đặc tả'}
                  </p>
                  <p className="text-xs text-slate-400">{comboSpecsFile ? 'Đã chọn · Click để đổi' : 'HTML, Word, PDF'}</p>
                </div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-emerald-500 italic">
                {comboMatrixFile && comboSpecsFile
                  ? '✅ Đã chọn đủ 2 file — Nhấn nút để xử lý'
                  : `⏳ Còn thiếu: ${!comboMatrixFile ? 'Ma trận' : ''}${!comboMatrixFile && !comboSpecsFile ? ' + ' : ''}${!comboSpecsFile ? 'Đặc tả' : ''}`
                }
              </p>
              <Button
                onClick={processComboShortcut}
                disabled={!comboMatrixFile || !comboSpecsFile}
                isLoading={isComboProcessing}
                icon={<ArrowRight className="w-4 h-4" />}
                className="whitespace-nowrap"
              >
                Xử lý & Tạo đề thi
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-teal-100/60"></div></div>
        <span className="relative bg-white px-4 py-1 text-xs font-bold text-teal-500 uppercase tracking-wider rounded-full border border-teal-100">Hoặc bắt đầu từ đầu</span>
      </div>

      {/* 1. Thiết lập đề 1 chạm */}
      <div className="card-elevated p-6 sm:p-8 animate-fade-in-up">
        <h2 className="text-xl font-bold text-teal-800 mb-2 flex items-center gap-2.5">
          <span className="badge-section text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">1</span>
          Chọn loại đề (thiết lập 1 chạm)
        </h2>
        <p className="text-sm text-slate-500 mb-4">Môn Hóa học, bộ sách {TEXTBOOK_NAME}. Chọn loại đề, app tự đặt số câu, thời gian và thang điểm.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {EXAM_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={presetId === preset.id}
              onClick={() => applyExamSetup({ presetId: preset.id })}
              className={`p-3.5 rounded-xl border-2 text-left transition-all ${presetId === preset.id ? 'border-teal-500 bg-teal-50 shadow-sm' : 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/30'}`}
            >
              <span className="block text-sm font-bold text-teal-900">{preset.label}</span>
              <span className="block text-xs text-slate-500 mt-1 leading-relaxed">{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-sm font-semibold text-teal-700 mb-2">Khối lớp</label>
            <select
              value={inputData.grade}
              disabled={!!getPreset(presetId)?.allGrades}
              onChange={e => applyExamSetup({ grade: e.target.value })}
              className="w-full p-3 input-elevated focus:ring-2 focus:ring-primary outline-none disabled:opacity-70"
            >
              {CHEMISTRY_GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
            </select>
            {getPreset(presetId)?.allGrades && <p className="text-xs text-slate-500 mt-1">Đề ôn thi lấy kiến thức cả 3 khối, trọng tâm lớp 12.</p>}
          </div>
          {getPreset(presetId)?.group === 'dinh-ky' && (
            <div>
              <label className="block text-sm font-semibold text-teal-700 mb-2">Kỳ kiểm tra</label>
              <select value={semesterExam} onChange={e => applyExamSetup({ semesterExam: e.target.value })} className="w-full p-3 input-elevated focus:ring-2 focus:ring-primary outline-none">
                <option>Giữa kỳ 1</option>
                <option>Cuối kỳ 1</option>
                <option>Giữa kỳ 2</option>
                <option>Cuối kỳ 2</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-teal-700 mb-2">Thời gian (phút)</label>
            <div className="relative">
              <input type="number" name="duration" value={inputData.duration} onChange={handleInputChange} className="w-full p-3 pl-10 input-elevated focus:ring-2 focus:ring-primary outline-none" />
              <Clock className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
            </div>
          </div>
        </div>

        {getPreset(presetId)?.customPoints && (
          <div className="mb-5 p-3 rounded-xl border border-teal-100 bg-teal-50/40">
            <span className="block text-sm font-semibold text-teal-700 mb-2">Tỉ trọng điểm từng phần (tổng phải bằng 10)</span>
            <div className="flex flex-wrap items-end gap-3">
              {([['type1', 'Phần I'], ['type2', 'Phần II'], ['type3', 'Phần III']] as const).map(([key, name]) => (
                <label key={key} className="text-xs text-slate-600">
                  <span className="block mb-1">{name}</span>
                  <input
                    type="number" min={0} max={10} step={0.25}
                    value={customPoints[key]}
                    onChange={e => {
                      const points = { ...customPoints, [key]: Number(e.target.value) || 0 };
                      setCustomPoints(points);
                      applyExamSetup({ points });
                    }}
                    className="w-20 p-2 input-elevated text-center text-sm"
                  />
                </label>
              ))}
              <span className={`text-xs font-semibold pb-2 ${customPoints.type1 + customPoints.type2 + customPoints.type3 === 10 ? 'text-emerald-700' : 'text-red-600'}`}>
                Tổng: {String(customPoints.type1 + customPoints.type2 + customPoints.type3).replace('.', ',')} điểm
              </span>
            </div>
          </div>
        )}

        {/* Tỉ lệ cấp độ tư duy */}
        <div className="p-4 rounded-xl border border-teal-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-sm font-semibold text-teal-700">Tỉ lệ cấp độ tư duy (theo điểm)</span>
            <div className="flex flex-wrap gap-2">
              {RATIO_SHORTCUTS.map(item => (
                <button key={item.label} type="button" onClick={() => applyExamSetup({ ratio: item.ratio })} className="text-xs px-2.5 py-1 rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs text-slate-600">
              <span className="flex justify-between mb-1"><span>Biết</span><strong>{levelRatio.biet}%</strong></span>
              <input
                type="range" min={10} max={70} step={5} value={levelRatio.biet} className="w-full"
                onChange={e => {
                  const biet = Number(e.target.value);
                  const hieu = Math.min(levelRatio.hieu, 90 - biet);
                  applyExamSetup({ ratio: { biet, hieu, vd: 100 - biet - hieu } });
                }}
              />
            </label>
            <label className="text-xs text-slate-600">
              <span className="flex justify-between mb-1"><span>Hiểu</span><strong>{levelRatio.hieu}%</strong></span>
              <input
                type="range" min={10} max={70} step={5} value={levelRatio.hieu} className="w-full"
                onChange={e => {
                  const hieu = Math.min(Number(e.target.value), 90 - levelRatio.biet);
                  applyExamSetup({ ratio: { biet: levelRatio.biet, hieu, vd: 100 - levelRatio.biet - hieu } });
                }}
              />
            </label>
          </div>
          {(() => {
            const actual = actualLevelPercent(inputData.questionConfig);
            return (
              <p className="text-xs text-slate-500 mt-2">
                Mục tiêu: Biết {levelRatio.biet}% – Hiểu {levelRatio.hieu}% – Vận dụng {levelRatio.vd}%. Sau khi chia theo số câu: Biết {actual.biet}% – Hiểu {actual.hieu}% – Vận dụng {actual.vd}%.
              </p>
            );
          })()}
        </div>
      </div>

      {/* Mẫu tiêu đề đề thi */}
      <details className="card-elevated p-6 sm:p-8 animate-fade-in-up">
        <summary className="cursor-pointer text-base font-bold text-teal-800">Mẫu tiêu đề đề thi của đơn vị (lưu cho các lần sau)</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {([['department', 'Sở Giáo dục và Đào tạo'], ['school', 'Tên trường'], ['group', 'Tổ chuyên môn'], ['schoolYear', 'Năm học']] as const).map(([key, name]) => (
            <label key={key} className="block text-xs font-semibold text-teal-700">
              <span className="block mb-1">{name}</span>
              <input value={headerProfile[key]} onChange={e => updateHeaderProfile({ [key]: e.target.value })} className="w-full p-2.5 input-elevated text-sm font-normal" />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={headerProfile.showInvigilator} onChange={e => updateHeaderProfile({ showInvigilator: e.target.checked })} />
            In dòng chữ kí giám thị
          </label>
          <button type="button" onClick={() => updateHeaderProfile(DEFAULT_HEADER_PROFILE)} className="text-xs text-teal-700 underline text-left">Khôi phục mẫu mặc định</button>
        </div>
      </details>

      {/* PPCT riêng của trường (không bắt buộc) */}
      <div className="card-elevated p-5 animate-fade-in-up">
        <p className="text-sm text-slate-600 mb-3">Đã nạp sẵn chương trình lớp 10, 11, 12 sách {TEXTBOOK_NAME}. Trường có phân phối chương trình riêng thì tải lên để thay thế (không bắt buộc).</p>
        <div className="p-5 upload-zone text-center relative">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.docx,.doc" className="hidden" id="file-upload" disabled={isAnalyzingFile} />
          <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center justify-center ${isAnalyzingFile ? 'opacity-70' : ''}`}>
            {isAnalyzingFile ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Đang phân tích... {analyzeProgress ? `${Math.max(0, Math.floor((analyzeNow - analyzeProgress.startedAt) / 1000))}s` : ''}
                </div>
                <div className="text-xs text-slate-500">
                  {!analyzeProgress?.model
                    ? 'Đang đọc file...'
                    : analyzeProgress.chars === 0
                      ? `AI (${analyzeProgress.model}) đang đọc tài liệu...`
                      : `AI (${analyzeProgress.model}) đã trích xuất ~${analyzeProgress.lessons} bài học...`}
                </div>
              </div>
            ) : uploadedFileName ? (
              <div className="flex items-center gap-2 text-green-700 font-medium"><Check className="w-5 h-5" /> {uploadedFileName} (Click thay đổi)</div>
            ) : (
              <div className="flex items-center gap-2 text-primary font-medium"><Upload className="w-5 h-5" /> Tải PPCT của trường (.pdf, .docx)</div>
            )}
          </label>
          {isAnalyzingFile && (
            <button type="button" onClick={() => analyzeAbortRef.current?.abort()} className="mt-2 text-xs px-3 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100">
              Hủy phân tích
            </button>
          )}
        </div>
      </div>

      {/* 2. Topic Selection Tree */}
      {inputData.chapters.length > 0 && (
        <div className="card-elevated p-6 sm:p-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-teal-800 flex items-center gap-2.5">
              <span className="badge-section text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              Chọn chủ đề trọng tâm
            </h2>
            <div className="flex gap-2 text-xs">
              <button onClick={() => applySmartFilter(inputData.examType, inputData.chapters)} className="flex items-center gap-1 text-primary hover:bg-teal-50 px-2 py-1 rounded"><Filter className="w-3 h-3" /> Lọc theo kỳ</button>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-teal-100 shadow-sm">
            {inputData.chapters.map(chap => {
              const isExpanded = expandedChapterIds.has(chap.id);
              const activeLessonCount = chap.lessons.filter(l => selectedLessonIds.has(l.id)).length;
              const isFullSelected = activeLessonCount === chap.lessons.length;
              const isPartSelected = activeLessonCount > 0 && !isFullSelected;

              return (
                <div key={chap.id} className="border-b border-slate-100 last:border-0">
                  {/* Chapter Header */}
                  <div className="flex items-center bg-teal-50/40 p-3 chapter-row">
                    <button onClick={() => toggleExpandChapter(chap.id)} className="p-1 mr-2 text-slate-500">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <input
                      type="checkbox"
                      className="w-4 h-4 mr-3 text-primary rounded focus:ring-primary"
                      checked={isFullSelected}
                      ref={el => { if (el) el.indeterminate = isPartSelected; }}
                      onChange={(e) => toggleChapter(chap.id, e.target.checked)}
                    />
                    <div className="flex-1 font-semibold text-sm text-teal-800">
                      {chap.name}
                    </div>
                    <span className="text-xs chip-teal px-2 py-0.5 text-teal-700 ml-2">
                      {chap.totalPeriods} tiết
                    </span>
                  </div>

                  {/* Lessons List */}
                  {isExpanded && (
                    <div className="pl-12 pr-4 py-2 space-y-1 bg-white">
                      {chap.lessons.map(lesson => (
                        <div key={lesson.id} className="flex items-center p-2 hover:bg-teal-50 rounded group">
                          <input
                            type="checkbox"
                            className="w-4 h-4 mr-3 text-primary rounded focus:ring-primary"
                            checked={selectedLessonIds.has(lesson.id)}
                            onChange={() => toggleLesson(lesson.id)}
                          />
                          <div className="flex-1 text-sm text-teal-700">
                            {lesson.name}
                          </div>
                          <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100">
                            <label className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded" title="Số tiết gợi ý, sửa theo PPCT của trường">
                              <input
                                type="number"
                                min={1}
                                aria-label={`Số tiết của ${lesson.name}`}
                                value={lesson.periods}
                                onChange={e => updateLessonPeriods(chap.id, lesson.id, Math.max(1, Number(e.target.value) || 1))}
                                className="w-8 bg-white rounded text-center"
                              />
                              tiết
                            </label>
                            {lesson.weekEnd && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Tuần {lesson.weekStart}-{lesson.weekEnd}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-between items-center text-sm text-teal-700 chip-teal p-3">
            <span>Đã chọn: <strong className="text-primary">{selectedLessonIds.size}</strong> bài học</span>
          </div>
        </div>
      )}

      {/* 3. Question Configuration */}
      <div className="card-elevated p-6 sm:p-8 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
        <h2 className="text-xl font-bold text-teal-800 mb-6 flex items-center gap-2.5">
          <span className="badge-section text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">3</span>
          Cấu trúc đề thi (Số lượng câu hỏi)
        </h2>
        <div className="config-table">
          {renderQuestionConfigRow("Dạng I (4 lựa chọn)", "type1", 8, 4, 0)}
          <div className="py-4 border-b border-teal-50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div className="sm:col-span-3">
                <span className="block text-sm font-semibold text-teal-700">Dạng II (Đúng/Sai)</span>
                <p className="text-xs text-teal-500 mt-1">Khai báo số câu, sau đó chọn mức độ riêng cho từng ý a, b, c, d.</p>
              </div>
              <div className="sm:col-span-2 flex flex-col">
                <span className="text-xs text-teal-500 mb-1">Số câu</span>
                <input type="number" min={0} className="w-full p-2 input-elevated text-center text-sm" value={getDungSaiQuestionCount(inputData.questionConfig)} onChange={e => updateDungSaiQuestionCount(Number(e.target.value))} />
              </div>
            </div>
            {getDungSaiLevelConfigs(inputData.questionConfig).map((question, questionIndex) => (
              <div key={questionIndex} className="rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                <span className="block text-sm font-bold text-teal-800 mb-2">Câu {questionIndex + 1}</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['yA', 'yB', 'yC', 'yD'] as const).map((key, idx) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs text-teal-500 mb-1">Ý {'abcd'[idx]}</span>
                      <select className="w-full p-2 input-elevated text-sm" value={question[key]} onChange={e => updateDungSaiLevel(questionIndex, key, e.target.value as DungSaiLevel)}>
                        <option value="nhan_biet">Nhận biết</option>
                        <option value="thong_hieu">Thông hiểu</option>
                        <option value="van_dung">Vận dụng</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {renderQuestionConfigRow("Dạng III (Trả lời ngắn)", "type3", 1, 1, 2)}
          {renderQuestionConfigRow("Tự luận", "essay", 0, 1, 2)}
        </div>
      </div>

      <div className="pt-6 flex justify-end">
        <Button
          onClick={handleGenerateMatrix}
          isLoading={genState.isLoading}
          disabled={selectedLessonIds.size === 0}
          icon={<ArrowRight className="w-5 h-5" />}
          className="w-full sm:w-auto px-8 py-3 text-lg shadow-lg shadow-teal-100"
        >
          Tạo Ma trận đề thi
        </Button>
      </div>

    </div>
  );

  const renderUploadedMatrixBanner = () => {
    const primary = contracts?.primary || null;
    const warnings = Array.from(new Set([
      ...(contracts?.warnings || []),
      ...(contracts?.matrix?.warnings || []).map(w => `Ma trận: ${w}`),
      ...(contracts?.specs?.warnings || []).map(w => `Đặc tả: ${w}`),
    ]));
    const tone = !primary ? 'red' : warnings.length ? 'amber' : 'emerald';
    const box = tone === 'red' ? 'bg-red-50 border-red-200 text-red-900' : tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50/90 border-emerald-200 text-emerald-900';
    const pointsText = primary?.sections
      ? primary.sections.filter(sec => sec.points !== undefined).map(sec => `${sec.name}: ${fmtNum(sec.points!)}đ`).join(' · ')
      : primary?.points.fromFile
      ? QTYPES.filter(t => primary.questionCount[t] > 0).map(t => `${t === 'IV' ? 'TL' : t}: ${primary.points.byType[t] !== undefined ? fmtNum(primary.points.byType[t]!) : '?'}đ`).join(' · ')
      : '';
    const source = contracts?.primarySource === 'specs' ? 'Bảng đặc tả' : 'Ma trận';
    return (
      <div className={`mb-3 px-4 py-2.5 rounded-xl border text-xs flex-shrink-0 space-y-1.5 ${box}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold flex items-center gap-1">
              {primary ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {primary ? `Đã đọc từ ${source} tải lên:` : 'Không đọc được số câu từ file:'}
            </span>
            <span>Môn: <strong>{CHEMISTRY_SUBJECT}</strong></span>
            <label className="flex items-center gap-1">Lớp:
              <select
                value={inputData.grade}
                onChange={e => setInputData(prev => ({ ...prev, grade: e.target.value }))}
                className={`px-1.5 py-0.5 rounded border bg-white text-xs font-semibold ${inputData.grade ? 'border-slate-300' : 'border-red-400'}`}
              >
                <option value="">--</option>
                {CHEMISTRY_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <span>Kỳ: <strong>{inputData.examType}</strong></span>
            {primary && <span>• Cấu trúc: <strong>{summarizeContract(primary)}</strong> ({primary.totalCommands} lệnh hỏi{primary.hasVDC ? ', có Vận dụng cao' : ''})</span>}
            {pointsText && <span>• Điểm: <strong>{pointsText}</strong></span>}
          </div>
          {currentStep === AppStep.MATRIX && genState.specs && (
            <button
              type="button"
              onClick={() => {
                setCurrentStep(AppStep.SPECS);
                setCompletedSteps(Math.max(completedSteps, 2));
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors flex items-center gap-1 shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              Dùng luôn Đặc tả trong file
            </button>
          )}
        </div>
        {!primary && (
          <p className="font-medium">App giữ nguyên cấu hình số câu hiện tại và để AI tự đọc bảng — hãy kiểm tra kỹ đề sinh ra. Nên dùng file Word (.docx) có cột Biết/Hiểu/Vận dụng theo từng dạng câu hỏi.</p>
        )}
        {warnings.length > 0 && (
          <details open={warnings.length <= 3}>
            <summary className="cursor-pointer font-semibold">⚠️ {warnings.length} điểm cần kiểm tra trong file</summary>
            <ul className="mt-1 list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </details>
        )}
      </div>
    );
  };

  const renderExamCheckBanner = () => {
    if (!examCheck) return null;
    const errors = examCheck.issues.filter(i => i.severity === 'error');
    const warns = examCheck.issues.filter(i => i.severity === 'warning');
    const ok = errors.length === 0;
    return (
      <div className={`mb-3 px-4 py-2.5 rounded-xl border text-xs flex-shrink-0 space-y-1 ${ok ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold flex items-center gap-1">
            {ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {ok
              ? `Kiểm tra tự động: đề đúng số câu từng phần${examCheck.usedContract ? ' theo ma trận / đặc tả' : ''}, đủ phương án và đáp án.`
              : `Kiểm tra tự động phát hiện ${errors.length} lỗi cấu trúc — vui lòng xem lại hoặc tạo lại đề.`}
            {examCheck.repaired && <span className="font-normal">(app đã tự sửa đề 1 lần)</span>}
            {examCheck.verifiedCount !== null && <span className="font-normal">AI đã giải lại độc lập {examCheck.verifiedCount} câu để đối chiếu đáp án.</span>}
            {examCheck.roundingAdded.length > 0 && <span className="font-normal">Đã thêm câu lệnh làm tròn ở Phần III câu {examCheck.roundingAdded.join(', ')}.</span>}
          </span>
          {!ok && (
            <button
              type="button"
              onClick={handleGenerateExam}
              disabled={genState.isLoading}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors flex items-center gap-1 shrink-0 disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tạo lại đề
            </button>
          )}
        </div>
        {(errors.length > 0 || warns.length > 0) && (
          <ul className="list-disc pl-5 space-y-0.5 max-h-28 overflow-y-auto">
            {[...errors, ...warns].map((i, k) => <li key={k} className={i.severity === 'error' ? 'font-medium' : ''}>{i.message}</li>)}
          </ul>
        )}
      </div>
    );
  };

  const renderContentStep = (
    title: string,
    content: string,
    onNext: () => void,
    nextLabel: string,
    isLastStep: boolean = false,
    onUpdateContent: (val: string) => void
  ) => (
    <div className="max-w-[1400px] mx-auto h-full flex flex-col p-4 sm:p-6 overflow-y-auto">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4 card-elevated p-4 flex-shrink-0">
        <h2 className="text-xl font-bold text-teal-800 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full badge-section text-white flex items-center justify-center text-sm shrink-0 font-bold">
            {currentStep + 1}
          </span>
          {title}
        </h2>
        <div className="flex flex-wrap gap-2.5">
          {/* Upload Matrix Button - Only for Matrix Step */}
          {currentStep === AppStep.MATRIX && (
            <>
              <input
                type="file"
                ref={matrixUploadRef}
                onChange={handleMatrixUpload}
                className="hidden"
                accept=".html,.txt,.pdf,.docx,.doc"
              />
              <Button
                variant="secondary"
                onClick={() => matrixUploadRef.current?.click()}
                icon={<Upload className="w-4 h-4" />}
                isLoading={genState.isLoading}
              >
                Upload Ma trận
              </Button>
            </>
          )}

          <MathFormatSelect />
          <Button variant="secondary" onClick={() => handleDownloadWord(content, title)} icon={<FileText className="w-4 h-4" />}>
            Tải Word (.docx)
          </Button>

          <Button variant="secondary" onClick={() => {
            const blob = new Blob([content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title}.html`;
            a.click();
          }} icon={<Download className="w-4 h-4" />}>
            Tải HTML
          </Button>

          {isLastStep && (
            <>
              <Button
                variant={isCurrentExamSaved ? 'secondary' : 'primary'}
                onClick={handleSaveHistory}
                disabled={isCurrentExamSaved || genState.isLoading || !content}
                icon={isCurrentExamSaved ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
              >
                {isCurrentExamSaved ? 'Đã lưu lịch sử' : 'Lưu lịch sử tạo'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowHistoryModal(true)}
                icon={<History className="w-4 h-4 text-teal-700" />}
              >
                Lịch sử tạo ({examHistory.length}/5)
              </Button>
            </>
          )}

          {!isLastStep && (
            <Button onClick={onNext} isLoading={genState.isLoading} icon={<ArrowRight className="w-4 h-4" />}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Thanh thông tin: số liệu app đọc được từ Ma trận / Đặc tả tải lên (Bước 2 & 3) */}
      {isUploadedMatrix && (currentStep === AppStep.MATRIX || currentStep === AppStep.SPECS) && renderUploadedMatrixBanner()}

      {/* Kết quả kiểm tra tự động đề vừa sinh (Bước 4) */}
      {currentStep === AppStep.EXAM && examCheck && renderExamCheckBanner()}

      {/* Đảo đề: tạo nhiều mã đề + file đáp án từ đề vừa sinh */}
      {isLastStep && content && !genState.isLoading && (
        <>
          <ExamPackagePanel
            className="mb-3"
            examHtml={content}
            matrixHtml={genState.matrix}
            specsHtml={genState.specs}
            inputData={inputData}
            baseName={`De_Hoa_hoc_${inputData.grade}`}
          />
          <ShuffleExamPanel
            className="mb-3"
            documents={[{ id: 'exam', label: 'Đề thi', exam: content }]}
            baseName={`De_Hoa_hoc_${inputData.grade}`}
            levelOf={buildLevelOf(genState.matrix, genState.specs)}
          />
        </>
      )}

      {/* Reference Document Upload - Only for SPECS step */}
      {currentStep === AppStep.SPECS && (
        <div className="mb-4 card-elevated p-4 flex-shrink-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-bold text-teal-800">Tài liệu tham khảo — Ngân hàng câu hỏi</span>
              <span className="text-xs text-slate-400">(tùy chọn)</span>
            </div>
            {referenceDocs.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => referenceUploadRef.current?.click()}
                  disabled={isParsingReference}
                  className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Thêm file
                </button>
                <button
                  type="button"
                  onClick={handleClearAllReferenceDocs}
                  className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa tất cả ({referenceDocs.length})
                </button>
              </div>
            )}
          </div>

          {/* 2 Options: Trích xuất chính xác vs Tham khảo dạng câu hỏi, thay số hoặc bối cảnh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setReferenceMode('exact')}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all ${
                referenceMode === 'exact'
                  ? 'border-teal-500 bg-teal-50/80 shadow-sm'
                  : 'border-slate-200 hover:border-teal-300 bg-white'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                referenceMode === 'exact' ? 'border-teal-600 bg-teal-600' : 'border-slate-300'
              }`}>
                {referenceMode === 'exact' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-teal-900">Trích xuất chính xác</div>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  Sử dụng nguyên văn các câu hỏi trong tài liệu vào đề thi (phù hợp với ma trận, đặc tả).
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setReferenceMode('adapt')}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all ${
                referenceMode === 'adapt'
                  ? 'border-teal-500 bg-teal-50/80 shadow-sm'
                  : 'border-slate-200 hover:border-teal-300 bg-white'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                referenceMode === 'adapt' ? 'border-teal-600 bg-teal-600' : 'border-slate-300'
              }`}>
                {referenceMode === 'adapt' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-teal-900">
                  Tham khảo dạng câu hỏi, thay số hoặc bối cảnh cho phù hợp
                </div>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  Giữ dạng bài từ tài liệu nhưng thay đổi số liệu, chất hoặc bối cảnh thực tế và giải lại đáp án.
                </p>
              </div>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleLoadSampleExams}
              disabled={isParsingReference}
              className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-60"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Nạp 2 đề mẫu Tốt nghiệp THPT 2026
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-700" title="Sau khi sinh đề, AI giải lại từng câu không nhìn đáp án rồi so khớp; sai khác sẽ được tự sửa 1 lần. Tốn thêm một lượt gọi AI.">
              <input type="checkbox" checked={verifyAnswers} onChange={e => setVerifyAnswers(e.target.checked)} />
              Kiểm chứng đáp án bằng AI giải lại
            </label>
          </div>

          <input
            type="file"
            multiple
            ref={referenceUploadRef}
            onChange={handleReferenceUpload}
            className="hidden"
            accept=".docx,.doc,.pdf,.txt,.html"
          />

          {/* Drag & Drop / Click Zone (always available to upload multiple files at once) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isParsingReference) setIsDraggingReference(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingReference(false);
            }}
            onDrop={handleReferenceDrop}
            onClick={() => !isParsingReference && referenceUploadRef.current?.click()}
            className={`cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl transition-all text-sm w-full ${
              isDraggingReference
                ? 'border-teal-500 bg-teal-50 text-teal-800 scale-[1.005]'
                : 'border-teal-200 hover:border-teal-400 hover:bg-teal-50/50 text-teal-600'
            } ${isParsingReference ? 'opacity-60 pointer-events-none' : ''}`}
          >
            {isParsingReference ? (
              <>
                <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-medium">Đang phân tích các tài liệu tải lên...</span>
              </>
            ) : (
              <>
                <Paperclip className="w-4 h-4 shrink-0" />
                <span className="font-medium text-center">
                  Kéo thả nhiều file vào đây hoặc click để chọn file đề mẫu / ngân hàng câu hỏi (.docx, .pdf)
                </span>
              </>
            )}
          </div>

          {/* Uploaded Files List & Extraction Summary */}
          {referenceDocs.length > 0 && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                {referenceDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2.5 px-3 py-2 bg-teal-50/70 border border-teal-200 rounded-lg"
                  >
                    <div className="w-7 h-7 bg-teal-100 rounded-md flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-teal-900 truncate" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {doc.method === 'hybrid'
                          ? `Hybrid: ${doc.wmfCount} MathType + ${doc.images.length} hình`
                          : doc.method === 'xml'
                            ? `Word XML: ${Math.max(1, Math.round(doc.text.length / 1000))}K ký tự`
                            : doc.method === 'pdf'
                              ? 'PDF / Hình ảnh đính kèm'
                              : `${Math.max(1, Math.round(doc.text.length / 1000))}K ký tự`
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveReferenceDoc(doc.id)}
                      className="shrink-0 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                      title="Xóa file này"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Extraction Status */}
              {isExtractingQuestions && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs sm:text-sm text-amber-700 font-medium">
                    Đang quét sâu câu hỏi từ {referenceDocs.length} tài liệu bằng AI...
                  </span>
                </div>
              )}

              {/* Extracted Questions Summary */}
              {extractedQuestions.length > 0 && !isExtractingQuestions && (
                <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs sm:text-sm font-bold text-emerald-800">
                        Đã phân tích nhanh {extractedQuestions.length} câu hỏi từ {referenceDocs.length} file (tức thì)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeepAiExtractReference}
                      className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-white/80 hover:bg-white px-2.5 py-1 rounded-md border border-emerald-200 transition-colors flex items-center gap-1"
                      title="Dùng AI quét sâu thêm (hữu ích nếu tài liệu có nhiều hình công thức hoặc PDF scan)"
                    >
                      <Sparkles className="w-3 h-3" />
                      Quét sâu bằng AI
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {(() => {
                      const byType = {
                        type1: extractedQuestions.filter(q => q.type === 'type1').length,
                        type2: extractedQuestions.filter(q => q.type === 'type2').length,
                        type3: extractedQuestions.filter(q => q.type === 'type3').length,
                        essay: extractedQuestions.filter(q => q.type === 'essay').length,
                      };
                      return (
                        <>
                          {byType.type1 > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md">Dạng I: {byType.type1} câu</span>}
                          {byType.type2 > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md">Dạng II: {byType.type2} câu</span>}
                          {byType.type3 > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md">Dạng III: {byType.type3} câu</span>}
                          {byType.essay > 0 && <span className="bg-pink-100 text-pink-700 px-2 py-1 rounded-md">Tự luận: {byType.essay} câu</span>}
                        </>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-emerald-700 mt-1.5 italic">
                    {referenceMode === 'exact'
                      ? '✅ Chế độ Trích xuất chính xác: Các câu hỏi sẽ được sử dụng NGUYÊN VĂN trong đề thi (phù hợp ma trận + đặc tả).'
                      : '🔄 Chế độ Tham khảo & Thay số: AI sẽ lấy dạng bài từ các câu hỏi này và thay đổi số liệu hoặc bối cảnh cho phù hợp.'}
                  </p>
                </div>
              )}

              {/* Ready status when file is PDF/image or unnumbered text */}
              {referenceDocs.length > 0 && !isExtractingQuestions && extractedQuestions.length === 0 && (
                <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-teal-50/80 border border-teal-200 rounded-lg flex-wrap">
                  <p className="text-xs text-teal-800 font-medium">
                    ✅ Đã nạp xong {referenceDocs.length} tài liệu ({Math.max(1, Math.round(getCombinedReferenceData(referenceDocs).text.length / 1000))}K ký tự). Sẵn sàng tạo đề theo chế độ "{referenceMode === 'exact' ? 'Trích xuất chính xác' : 'Tham khảo dạng câu hỏi, thay số hoặc bối cảnh'}".
                  </p>
                  <button
                    type="button"
                    onClick={handleDeepAiExtractReference}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-white px-2.5 py-1 rounded-md border border-teal-200 transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-3 h-3" />
                    Bóc tách trước bằng AI
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {currentStep === AppStep.EXAM && (
        <ChemFigurePanel
          className="mb-3"
          documents={[{ id: 'exam', label: 'Đề thi', content, onUpdate: onUpdateContent }]}
        />
      )}

      <div className="flex-1 min-h-[75vh] flex flex-col pb-2 relative">
        {/* Loading overlay when generating additional exam from history */}
        {genState.isLoading && isLastStep && (
          <div className="absolute inset-0 z-20 bg-white/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-bold text-teal-800">
              Đang sinh đề thi mới từ Ma trận & Bảng đặc tả đã lưu...
            </p>
            <p className="text-xs text-slate-500">
              Hệ thống đang giữ nguyên cấu trúc Ma trận, Đặc tả và sinh bộ câu hỏi mới.
            </p>
          </div>
        )}

        {/* Preview Side */}
        <div className="flex flex-col h-full panel-elevated">
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-2.5 border-b border-teal-100/50 flex-shrink-0">
            <label className="text-xs font-bold text-primary uppercase tracking-wider">Xem trước</label>
          </div>
          <div className="flex-1 overflow-auto bg-white p-2">
            <MarkdownView content={content} examLayout={currentStep === AppStep.EXAM} />
          </div>
        </div>
      </div>
    </div>
  );

  const handleReset = () => {
    if (window.confirm("Tạo mới sẽ xóa toàn bộ dữ liệu hiện tại?")) {
      setInputData(buildInitialInput());
      setPresetId(DEFAULT_PRESET_ID);
      setSemesterExam(DEFAULT_SEMESTER_EXAM);
      setLevelRatio(DEFAULT_LEVEL_RATIO);
      setUploadedFileName(null);
      setIsUploadedMatrix(false);
      setContracts(null);
      setExamCheck(null);
      setCurrentStep(AppStep.INPUT);
      setCompletedSteps(0);
      setSelectedLessonIds(lessonIdsForExam(DEFAULT_SEMESTER_EXAM, getChemistryChapters(DEFAULT_GRADE)));
      setExpandedChapterIds(new Set(getChemistryChapters(DEFAULT_GRADE).map(c => c.id)));
      setReferenceDocs([]);
      setReferenceMode('exact');
      setExtractedQuestions([]);
      setComboMatrixFile(null);
      setComboSpecsFile(null);
      setIsCurrentExamSaved(false);
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-app-gradient font-sans text-black overflow-hidden">

      {/* History Modal (5 lịch sử tạo gần nhất) */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-elevated max-w-2xl w-full p-0 overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 50%, #115e59 100%)' }} className="p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/15">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Lịch sử tạo đề thi (5 gần nhất)</h2>
                  <p className="text-xs text-teal-100">Bấm "Tạo đề thi" để tận dụng Ma trận & Đặc tả đã tạo trước đó sinh đề thêm</p>
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {examHistory.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <History className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-600">Chưa có lịch sử tạo đề nào được lưu</p>
                  <p className="text-xs text-slate-400">Sau khi tạo xong đề thi, hãy bấm nút "Lưu lịch sử tạo" để lưu lại Ma trận, Đặc tả và Đề thi tại đây.</p>
                </div>
              ) : (
                examHistory.slice(0, 5).map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-teal-100 bg-white hover:border-teal-300 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-teal-100 text-teal-800 shrink-0">
                          #{idx + 1}
                        </span>
                        <h3 className="text-sm font-bold text-teal-900 truncate" title={item.title}>
                          {item.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>🕒 {item.createdAt}</span>
                        <span>•</span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                          Đã lưu Ma trận + Đặc tả + Đề
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        onClick={() => handleGenerateExamFromHistory(item)}
                        isLoading={genState.isLoading}
                        icon={<Sparkles className="w-4 h-4" />}
                        className="text-xs px-3.5 py-2 whitespace-nowrap"
                      >
                        Tạo đề thi
                      </Button>
                      <button
                        onClick={() => handleRestoreHistory(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 text-teal-700 hover:bg-teal-50 text-xs font-semibold transition-colors whitespace-nowrap"
                        title="Xem lại Ma trận, Đặc tả và Đề thi đã lưu"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Xem lại
                      </button>
                      <button
                        onClick={() => handleDeleteHistoryItem(item.id)}
                        className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                        title="Xóa lịch sử này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="modal-elevated max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-teal-800">Cài đặt AI System</h2>
                <p className="text-sm text-teal-500">Cấu hình Nhà cung cấp & API Key</p>
              </div>
            </div>
            <div className="space-y-5">
              {/* Provider Selection */}
              <div>
                <label className="text-sm font-semibold text-teal-700 mb-2 block">⚡ Nền tảng AI (Provider)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProviderState('gemini');
                      setApiKeyError('');
                      if (!GEMINI_MODELS.some(m => m.id === selectedModel)) {
                        setSelectedModelState(DEFAULT_GEMINI_MODEL);
                        setSelectedModel(DEFAULT_GEMINI_MODEL);
                      }
                    }}
                    className={`p-3 rounded-xl border-2 font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                      provider === 'gemini'
                        ? 'border-teal-600 bg-teal-50 text-teal-800 font-bold shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-teal-300'
                    }`}
                  >
                    <span>Google Gemini</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProviderState('agent-platform');
                      setApiKeyError('');
                      if (!AGENT_PLATFORM_MODELS.some(m => m.id === selectedModel)) {
                        setSelectedModelState(DEFAULT_AGENT_PLATFORM_MODEL);
                        setSelectedModel(DEFAULT_AGENT_PLATFORM_MODEL);
                      }
                    }}
                    className={`p-3 rounded-xl border-2 font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                      provider === 'agent-platform'
                        ? 'border-teal-600 bg-teal-50 text-teal-800 font-bold shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-teal-300'
                    }`}
                  >
                    <span>Agent Platform</span>
                  </button>
                </div>
              </div>

              {/* API Key Section */}
              {provider === 'gemini' ? (
                <div>
                  <label className="text-sm font-semibold text-teal-700 mb-2 block">🔑 API Key (Google Gemini)</label>
                  <input
                    type="password"
                    value={tempGeminiKey}
                    onChange={(e) => {
                      setTempGeminiKey(e.target.value);
                      if (apiKeyError) setApiKeyError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                    placeholder="Dán Gemini API Key (AIzaSy... hoặc AQ...)"
                    className="w-full p-3 input-elevated focus:ring-2 focus:ring-primary outline-none font-mono text-sm"
                    autoFocus
                  />
                  <a
                    href="https://aistudio.google.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline font-medium mt-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Lấy API Key miễn phí tại Google AI Studio
                  </a>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-semibold text-teal-700 mb-2 block">🔑 API Key (Agent Platform)</label>
                  <input
                    type="password"
                    value={tempAgentPlatformKey}
                    onChange={(e) => {
                      setTempAgentPlatformKey(e.target.value);
                      if (apiKeyError) setApiKeyError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                    placeholder="Dán Agent Platform API Key (AQ... hoặc AIzaSy...)"
                    className="w-full p-3 input-elevated focus:ring-2 focus:ring-primary outline-none font-mono text-sm"
                    autoFocus
                  />
                  <a
                    href="https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline font-medium mt-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Hướng dẫn lấy API Key tại Agent Platform
                  </a>
                </div>
              )}

              {apiKeyError && (
                <p className="text-sm text-red-600 font-medium">{apiKeyError}</p>
              )}

              {/* Model Selector */}
              <div>
                <label className="text-sm font-semibold text-teal-700 mb-3 block">🤖 Chọn Model AI</label>
                <div className="space-y-2">
                  {(provider === 'agent-platform' ? AGENT_PLATFORM_MODELS : GEMINI_MODELS).map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModelState(m.id); setSelectedModel(m.id); }}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${selectedModel === m.id
                        ? 'border-teal-500 bg-teal-50 shadow-sm'
                        : 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/30'
                        }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-teal-800">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.desc}</div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.badge === 'Mặc định' ? 'bg-teal-100 text-teal-700' :
                        m.badge === 'Pro' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{m.badge}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleSaveApiKey} className="w-full py-3" icon={<Key className="w-4 h-4" />}>
                Lưu & Áp dụng
              </Button>
              {apiKey && (
                <button onClick={() => setShowApiKeyModal(false)} className="w-full text-center text-sm text-slate-500 hover:text-slate-800 py-2">
                  Hủy
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="glass-header shrink-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 badge-section rounded-xl flex items-center justify-center text-white">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-teal-900 leading-tight">{APP_INFO.name}</h1>
              <p className="text-xs text-slate-500 leading-tight">{APP_INFO.author} · {APP_INFO.school} · {APP_INFO.specialty}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ marginLeft: '8px' }}>


            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(prev => !prev)}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
              title={darkMode ? 'Chế độ sáng' : 'Chế độ tối'}
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
            <button
              onClick={() => {
                const activeProvider = getAiProvider();
                const savedModel = getSelectedModel();
                const validModels = activeProvider === 'agent-platform' ? AGENT_PLATFORM_MODELS : GEMINI_MODELS;
                const defaultModel = activeProvider === 'agent-platform' ? DEFAULT_AGENT_PLATFORM_MODEL : DEFAULT_GEMINI_MODEL;
                setProviderState(activeProvider);
                setSelectedModelState(savedModel && validModels.some(m => m.id === savedModel) ? savedModel : defaultModel);
                setTempGeminiKey(getApiKey('gemini') || '');
                setTempAgentPlatformKey(getApiKey('agent-platform') || '');
                setApiKeyError('');
                setShowApiKeyModal(true);
              }}
              className="flex items-center gap-2 text-sm px-3 py-1.5 h-9 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-600" />
              {!apiKey && <span className="text-red-500 font-medium text-xs">Lấy API key để sử dụng app</span>}
              {apiKey && (
                <span className="text-teal-700 font-medium text-xs">
                  Cài đặt ({provider === 'agent-platform' ? 'Agent Platform' : 'Gemini'})
                </span>
              )}
            </button>
            <Button
              variant="secondary"
              onClick={() => setShowHistoryModal(true)}
              icon={<History className="w-4 h-4 text-teal-700" />}
              className="text-sm px-3 py-1.5 h-9"
            >
              Lịch sử tạo {examHistory.length > 0 ? `(${examHistory.length})` : ''}
            </Button>
            <Button variant="secondary" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />} className="text-sm px-3 py-1.5 h-9">
              Tạo mới
            </Button>
          </div>
        </div>
      </header>

      {/* ===== BACK TO HOME BUTTON (only when inside a mode) ===== */}
      {appMode !== 'home' && (
        <div className="shrink-0 border-b border-teal-100 bg-white/90 backdrop-blur-sm">
          <div className="max-w-[1600px] mx-auto px-4 py-1.5 flex items-center gap-3">
            <button onClick={() => setAppMode('home')} className="back-home-btn">
              <ArrowLeft className="w-3.5 h-3.5" />
              Trang chủ
            </button>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-sm font-semibold text-slate-700">
              {appMode === 'cv7991' && '🔧 Tạo đề theo ma trận'}
              {appMode === 'similar' && '📋 Tạo đề tương tự'}
              {appMode === 'variants' && '🔀 Sinh 3 đề biến thể'}
            </span>
          </div>
        </div>
      )}

      {/* Progress — chỉ hiển thị cho mode CV 7991 */}
      {appMode === 'cv7991' && (
        <div className="shrink-0">
          <StepIndicator currentStep={currentStep} setStep={setCurrentStep} completedSteps={completedSteps} />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 relative w-full overflow-hidden">

        {/* Transient Fallback Notice Banner */}
        {fallbackNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2.5 max-w-xl animate-fade-in-up">
            <Sparkles className="w-4 h-4 shrink-0 text-amber-600 animate-spin" />
            <span className="text-sm flex-1 font-medium">{fallbackNotice}</span>
            <button
              onClick={() => setFallbackNotice(null)}
              className="shrink-0 hover:bg-amber-200/60 rounded p-0.5 transition-colors"
              title="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ===== HOME LANDING — 3 MODE CARDS ===== */}
        {appMode === 'home' && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 sm:py-16">
              {/* Hero Title */}
              <div className="text-center mb-10 animate-fade-in-up">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-50 border border-teal-200 rounded-full text-sm font-medium text-teal-700 mb-4">
                  <Sparkles className="w-4 h-4" />
                  Powered by Google Gemini AI
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
                  Tạo đề thi <span className="bg-gradient-to-r from-teal-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">Hóa học THPT</span>
                </h1>
                <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto">
                  Lớp 10, 11, 12 và ôn thi Tốt nghiệp THPT, chuẩn GDPT 2018, sách {TEXTBOOK_NAME}
                </p>
              </div>

              {/* 3 Mode Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">

                {/* Card 1: CV 7991 — TEAL */}
                <div className="mode-card mode-card-teal card-stagger-1" onClick={() => setAppMode('cv7991')}>
                  <div className="particle" style={{ width: 8, height: 8, background: '#14b8a6', top: '15%', right: '20%', animationDelay: '0s' }} />
                  <div className="particle" style={{ width: 6, height: 6, background: '#0d9488', bottom: '25%', left: '15%', animationDelay: '1.5s' }} />
                  <div className="mode-card-icon">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-teal-900 mb-2">Tạo đề theo ma trận</h3>
                  <p className="text-sm text-teal-700/70 mb-5 leading-relaxed">
                    Chọn loại đề 1 chạm → Ma trận → Đặc tả → Đề thi và hồ sơ khảo thí
                  </p>
                  <div className="space-y-1.5 mb-6">
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#0d9488' }} /><span>Nạp sẵn chương trình Hóa 10, 11, 12</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#0d9488' }} /><span>Cấu trúc đề Tốt nghiệp, định kỳ, thường xuyên</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#0d9488' }} /><span>Kiểm duyệt IUPAC, 24,79 L, đáp án 4 kí tự</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#0d9488' }} /><span>Xuất trọn bộ 5 hồ sơ trong 1 lần bấm</span></div>
                  </div>
                  <button className="mode-card-btn" onClick={(e) => { e.stopPropagation(); setAppMode('cv7991'); }}>
                    <Zap className="w-4 h-4" />
                    Bắt đầu
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Card 2: Tạo đề tương tự — BLUE */}
                <div className="mode-card mode-card-blue card-stagger-2" onClick={() => setAppMode('similar')}>
                  <div className="particle" style={{ width: 8, height: 8, background: '#3b82f6', top: '20%', left: '25%', animationDelay: '0.5s' }} />
                  <div className="particle" style={{ width: 6, height: 6, background: '#2563eb', bottom: '15%', right: '20%', animationDelay: '2s' }} />
                  <div className="mode-card-icon">
                    <Copy className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-blue-900 mb-2">Tạo đề tương tự</h3>
                  <p className="text-sm text-blue-700/70 mb-5 leading-relaxed">
                    Tải 1 đề Hóa mẫu → AI phân tích cấu trúc và sinh đề mới cùng dạng
                  </p>
                  <div className="space-y-1.5 mb-6">
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#2563eb' }} /><span>Phân tích ma trận tự động</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#2563eb' }} /><span>Giữ cấu trúc, thay chất và số liệu</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#2563eb' }} /><span>Lời giải chi tiết kèm theo</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#2563eb' }} /><span>Hỗ trợ Word, PDF, ảnh chụp</span></div>
                  </div>
                  <button className="mode-card-btn" onClick={(e) => { e.stopPropagation(); setAppMode('similar'); }}>
                    <Layers className="w-4 h-4" />
                    Bắt đầu
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Card 3: Sinh 3 đề biến thể — PURPLE */}
                <div className="mode-card mode-card-purple card-stagger-3" onClick={() => setAppMode('variants')}>
                  <div className="particle" style={{ width: 8, height: 8, background: '#8b5cf6', top: '10%', right: '15%', animationDelay: '1s' }} />
                  <div className="particle" style={{ width: 6, height: 6, background: '#7c3aed', bottom: '20%', left: '10%', animationDelay: '2.5s' }} />
                  <div className="mode-card-icon">
                    <Shuffle className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-purple-900 mb-2">Sinh 3 đề biến thể</h3>
                  <p className="text-sm text-purple-700/70 mb-5 leading-relaxed">
                    Tải 1 đề Hóa gốc → AI sinh 3 đề khác nhau kèm đáp án chi tiết
                  </p>
                  <div className="space-y-1.5 mb-6">
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#7c3aed' }} /><span>3 đề biến thể từ 1 gốc</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#7c3aed' }} /><span>Streaming thời gian thực</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#7c3aed' }} /><span>Đáp án chi tiết cho câu khó</span></div>
                    <div className="mode-card-feature"><div className="dot" style={{ background: '#7c3aed' }} /><span>Xuất 1 file Word gộp 3 đề</span></div>
                  </div>
                  <button className="mode-card-btn" onClick={(e) => { e.stopPropagation(); setAppMode('variants'); }}>
                    <Sparkles className="w-4 h-4" />
                    Bắt đầu
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* ===== MODE: CV 7991 (Pipeline gốc) ===== */}
        {appMode === 'cv7991' && (
          <>
            {/* Error Toast */}
            {genState.error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-100 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 max-w-xl animate-fade-in-up">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm flex-1">{genState.error}</span>
                <button onClick={() => setGenState(prev => ({ ...prev, error: null }))} className="shrink-0 hover:bg-red-200 rounded p-0.5 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {currentStep === AppStep.INPUT && (
              <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
                {renderInputStep()}
              </div>
            )}

            {currentStep === AppStep.MATRIX && (
              <div className="absolute inset-0">
                {renderContentStep(
                  "Ma trận đề thi",
                  genState.matrix,
                  handleGenerateSpecs,
                  "Tiếp theo: Bảng đặc tả",
                  false,
                  (val) => setGenState(prev => ({ ...prev, matrix: val }))
                )}
              </div>
            )}

            {currentStep === AppStep.SPECS && (
              <div className="absolute inset-0">
                {renderContentStep(
                  "Bảng đặc tả",
                  genState.specs,
                  handleGenerateExam,
                  "Tiếp theo: Đề thi",
                  false,
                  (val) => setGenState(prev => ({ ...prev, specs: val }))
                )}
              </div>
            )}

            {currentStep === AppStep.EXAM && (
              <div className="absolute inset-0">
                {renderContentStep(
                  "Đề thi hoàn chỉnh",
                  genState.exam,
                  () => { },
                  "Hoàn tất",
                  true,
                  (val) => setGenState(prev => ({ ...prev, exam: val }))
                )}
              </div>
            )}
          </>
        )}

        {/* ===== MODE: TẠO ĐỀ TƯƠNG TỰ ===== */}
        {appMode === 'similar' && (
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
            <SimilarExamPage />
          </div>
        )}

        {/* ===== MODE: SINH 3 ĐỀ BIẾN THỂ ===== */}
        {appMode === 'variants' && (
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
            <VariantsExamPage />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="shrink-0 text-center py-3 text-xs text-slate-400 border-t border-slate-200/50 space-y-1">
        <p>{APP_INFO.shortName} © 2026 | {APP_INFO.author} – {APP_INFO.school} – {APP_INFO.specialty}</p>
        <p>Mọi tool AI và khóa học tạo app dành cho giáo viên có tại: <a href="https://giaovienai.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 underline font-medium">giaovienai.vercel.app</a></p>
      </footer>
    </div>
  );
};

export default App;
