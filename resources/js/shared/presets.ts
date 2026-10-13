export interface SafeZoneRect {
  labelKey: string; // Ключ локализации для vue-i18n
  label: string;    // Дефолтный текст (RU)
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PromoPreset {
  id: string;
  region: ('ru' | 'global')[];
  platform: 'yandex_games' | 'telegram' | 'vk_play' | 'rustore';
  title: string;
  fileName: string;
  width: number;
  height: number;
  maxSizeKb: number;
  formats: ('webp' | 'png' | 'jpg')[];
  borderRadiusPct?: number;
  safeZones: SafeZoneRect[];
}

export type PromoPlatform = PromoPreset['platform'];

export const PROMO_PRESETS: PromoPreset[] = [
  {
    id: 'ya_icon',
    region: ['ru'],
    platform: 'yandex_games',
    title: 'Яндекс Игры — Иконка',
    fileName: 'yandex_icon_512x512',
    width: 512,
    height: 512,
    maxSizeKb: 500,
    formats: ['png', 'webp'],
    borderRadiusPct: 22,
    safeZones: [
      { labelKey: 'sz.ya_badge', label: 'Бейдж рейтинга / Новинка', x: 0.0, y: 0.0, width: 1.0, height: 0.18 },
      { labelKey: 'sz.ya_bottom_radius', label: 'Скругление углов нижней кромки', x: 0.0, y: 0.85, width: 1.0, height: 0.15 }
    ]
  },
  {
    id: 'ya_cover_horizontal',
    region: ['ru'],
    platform: 'yandex_games',
    title: 'Яндекс Игры — Обложка (Горизонтальная)',
    fileName: 'yandex_cover_800x470',
    width: 800,
    height: 470,
    maxSizeKb: 1000,
    formats: ['png', 'webp'],
    safeZones: [
      { labelKey: 'sz.ya_top_bars', label: 'Верхние плашки каталога', x: 0.0, y: 0.0, width: 1.0, height: 0.16 },
      { labelKey: 'sz.ya_bottom_grad', label: 'Градиент названия и кнопки', x: 0.0, y: 0.72, width: 1.0, height: 0.28 }
    ]
  },
  {
    id: 'ya_cover_vertical',
    region: ['ru'],
    platform: 'yandex_games',
    title: 'Яндекс Игры — Обложка (Мобильная)',
    fileName: 'yandex_vertical_450x600',
    width: 450,
    height: 600,
    maxSizeKb: 1000,
    formats: ['png', 'webp'],
    safeZones: [
      { labelKey: 'sz.ya_top_badges', label: 'Бейджи сверху', x: 0.0, y: 0.0, width: 1.0, height: 0.15 },
      { labelKey: 'sz.ya_bottom_ui', label: 'Нижняя зона UI', x: 0.0, y: 0.78, width: 1.0, height: 0.22 }
    ]
  },
  {
    id: 'tg_miniapp_promo',
    region: ['ru', 'global'],
    platform: 'telegram',
    title: 'Telegram Mini App — Промо бота (BotFather)',
    fileName: 'tg_bot_promo_640x360',
    width: 640,
    height: 360,
    maxSizeKb: 500,
    formats: ['png', 'jpg'],
    safeZones: [
      { labelKey: 'sz.tg_launch_btn', label: 'Кнопка запуска / описание', x: 0.0, y: 0.80, width: 1.0, height: 0.20 }
    ]
  },
  {
    id: 'vk_play_catalog',
    region: ['ru'],
    platform: 'vk_play',
    title: 'VK Play — Каталожная обложка (16:9)',
    fileName: 'vk_play_1920x1080',
    width: 1920,
    height: 1080,
    maxSizeKb: 2048,
    formats: ['jpg', 'png'],
    safeZones: [
      { labelKey: 'sz.vk_margin', label: 'Отступ от краев (10%)', x: 0.0, y: 0.85, width: 1.0, height: 0.15 }
    ]
  }
];

export type PlatformFilter = 'all' | PromoPlatform;

export const PLATFORM_FILTERS: PlatformFilter[] = ['all', 'yandex_games', 'telegram', 'vk_play'];

export function findPreset(id: string): PromoPreset | undefined {
  return PROMO_PRESETS.find((p) => p.id === id);
}

/**
 * Пресеты для текущего региона и фильтра площадок.
 * RuStore использует каталожные обложки 16:9, поэтому разделяет пресеты VK Play.
 */
export function filterPresets(filter: PlatformFilter, region: 'ru' | 'global' = 'ru'): PromoPreset[] {
  return PROMO_PRESETS.filter((p) => {
    if (!p.region.includes(region)) return false;
    if (filter === 'all') return true;
    if (filter === 'rustore') return p.platform === 'vk_play' || p.platform === 'rustore';
    return p.platform === filter;
  });
}

export function isPlatformFilter(value: unknown): value is PlatformFilter {
  return value === 'all' || value === 'yandex_games' || value === 'telegram' || value === 'vk_play' || value === 'rustore';
}
