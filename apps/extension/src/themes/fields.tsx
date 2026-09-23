import { jsx, el } from '../shared/jsx-dom';
import { createSvgIcon, ICON_VIEW_BOX, TRASH_ICON_PATH } from '../shared/icons';
import { getExtensionMessage as message } from '../shared/extension-page-i18n';
import { THEME_AREAS, type ThemeArea, type CustomTheme } from '../shared/custom-themes';
import { THEME_FONT_OPTIONS } from '../shared/theme-fonts';

export const THEME_EDITOR_TABS = {
  colors: 'themeSection_colors',
  style: 'themeSection_style',
  background: 'themeBackground',
  details: 'themeSection_details'
} as const;
export type ThemeEditorTab = keyof typeof THEME_EDITOR_TABS;

// Purpose-drawn area diagrams match the popup's existing stroked icons.
const AREA_PATHS: Record<ThemeArea, string> = {
  header:
    'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M3 8h18 M7 5.5h6',
  chat: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M7 8h10 M7 12h7 M7 16h10',
  composer:
    'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M3 14h18 M7 17.5h5 M16 16l2 1.5-2 1.5'
};

export function areaButtons(onSelect: (area: ThemeArea) => void): HTMLElement {
  return el<HTMLElement>(
    <div class="theme-areas popup-tabs" role="group" aria-label={message('themeArea')}>
      {THEME_AREAS.map((area) => (
        <button
          type="button"
          class="theme-area popup-tab"
          data-theme-area={area}
          aria-pressed={area === 'header'}
          onClick={() => onSelect(area)}
        >
          {createSvgIcon(ICON_VIEW_BOX, AREA_PATHS[area], 1.5)}
          <span>{message(`themeArea_${area}`)}</span>
        </button>
      ))}
    </div>
  );
}

function colorField(
  key: string,
  value: string,
  label: string,
  update: (value: string) => void
): HTMLElement {
  return el<HTMLElement>(
    <div class="theme-color">
      <label>
        <input
          type="color"
          data-theme-field={key}
          value={value}
          aria-label={message(label)}
          onInput={(event: Event) => {
            update((event.target as HTMLInputElement).value);
          }}
        />
        <span>{message(label)}</span>
      </label>
    </div>
  );
}

function selectField(
  key: string,
  value: string,
  label: string,
  options: string[],
  update: (value: string) => void
): HTMLElement {
  const select = el<HTMLSelectElement>(
    <select
      data-theme-field={key}
      aria-label={message(label)}
      onChange={(event: Event) => update((event.target as HTMLSelectElement).value)}
    >
      {options.map((option) => (
        <option value={option}>{message(`theme_${option.replaceAll('-', '_')}`)}</option>
      ))}
    </select>
  );
  select.value = value;
  return el<HTMLElement>(
    <label class="theme-field">
      <span>{message(label)}</span>
      {select}
    </label>
  );
}

function rangeField(
  key: string,
  value: number,
  label: string,
  max: number,
  unit: string,
  update: (value: number) => void,
  min = 0
): HTMLElement {
  const output = el<HTMLOutputElement>(
    <output>
      {value}
      {unit}
    </output>
  );
  return el<HTMLElement>(
    <label class="theme-range">
      <span>
        {message(label)} {output}
      </span>
      <input
        type="range"
        data-theme-field={key}
        min={min}
        max={max}
        value={value}
        aria-label={message(label)}
        onInput={(event: Event) => {
          const next = Number((event.target as HTMLInputElement).value);
          output.value = `${next}${unit}`;
          update(next);
        }}
      />
    </label>
  );
}

function imageField(
  key: string,
  value: string,
  label: string,
  update: (image: string) => void,
  upload: (file: File, update: (image: string) => void) => void
): HTMLElement {
  return el<HTMLElement>(
    <div class="theme-image-picker">
      <label for={`theme-image-${key}`}>{message(label)}</label>
      <div class="theme-image-row">
        {value ? (
          <a
            class="theme-image-preview"
            href={`theme-image.html#${new URLSearchParams({ image: value })}`}
            target="_blank"
            rel="noopener"
            aria-label={message('themeOpenImage')}
            title={message('themeOpenImage')}
          >
            <img src={value} alt="" />
          </a>
        ) : null}
        <input
          id={`theme-image-${key}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          data-theme-field={key}
          aria-label={message(label)}
          onChange={(event: Event) => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = '';
            if (file) upload(file, update);
          }}
        />
        {value ? (
          <button
            type="button"
            class="theme-icon-button"
            aria-label={message('themeRemoveImage')}
            title={message('themeRemoveImage')}
            onClick={() => update('')}
          >
            {createSvgIcon(ICON_VIEW_BOX, TRASH_ICON_PATH, 1.7)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function group(tab: ThemeEditorTab, children: Node[]): HTMLElement {
  return el<HTMLElement>(
    <section
      class="theme-field-group"
      id={`theme-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`theme-tab-${tab}`}
      data-theme-panel={tab}
      hidden
    >
      {children}
    </section>
  );
}

function section(title: string, children: Node[]): HTMLElement {
  return el<HTMLElement>(
    <section class="theme-subsection">
      <h3>{message(title)}</h3>
      <div class="theme-fields-content">{children}</div>
    </section>
  );
}

type UpdateTheme = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
  rebuild?: boolean
) => void;
type UploadImage = (file: File, update: (image: string) => void) => void;

export function themeFields(
  theme: CustomTheme,
  area: ThemeArea,
  areas: HTMLElement,
  update: UpdateTheme,
  upload: UploadImage
): HTMLElement {
  return el<HTMLElement>(
    <div class="theme-fields-content">
      {group('colors', [
        el<HTMLElement>(
          <div class="theme-colors">
            {(['accent', 'secondary', 'border'] as const).map((key) =>
              colorField(
                key,
                theme[key],
                { accent: 'themeAccent', secondary: 'themeSecondary', border: 'themeBorder' }[key],
                (value) => update(theme, key, value)
              )
            )}
          </div>
        ),
        rangeField('surfaceTint', theme.surfaceTint, 'themeSurfaceTint', 100, '%', (value) =>
          update(theme, 'surfaceTint', value)
        ),
        el<HTMLElement>(<p class="theme-field-hint">{message('themeSurfaceTintHint')}</p>)
      ])}
      {group('style', [
        selectField('font', theme.font, 'themeFont', THEME_FONT_OPTIONS, (value) =>
          update(theme, 'font', value as typeof theme.font)
        ),
        selectField(
          'finish',
          theme.finish,
          'themeFinishStyle',
          ['flat', 'glossy', 'glass'],
          (value) => update(theme, 'finish', value as typeof theme.finish, true)
        ),
        el<HTMLElement>(
          <p class="theme-field-hint">{message('themeFinishHint_' + theme.finish)}</p>
        ),
        section('themeShapeDepth', [
          rangeField('radius', theme.radius, 'themeCorners', 24, 'px', (value) =>
            update(theme, 'radius', value)
          ),
          rangeField('shadow', theme.shadow, 'themeShadow', 100, '%', (value) =>
            update(theme, 'shadow', value)
          ),
          el<HTMLElement>(<p class="theme-field-hint">{message('themeShadowHint')}</p>),
          ...(theme.finish !== 'flat'
            ? [
                rangeField('shine', theme.shine, 'themeShine', 100, '%', (value) =>
                  update(theme, 'shine', value)
                )
              ]
            : []),
          ...(theme.finish === 'glass'
            ? [
                rangeField('blur', theme.blur, 'themeBlur', 24, 'px', (value) =>
                  update(theme, 'blur', value)
                )
              ]
            : [])
        ])
      ])}
      {group('background', [areas, themeBackgroundFields(theme, area, update, upload)])}
      {group('details', [
        selectField(
          'avatarShape',
          theme.avatarShape,
          'themeAvatarShape',
          ['round', 'square'],
          (value) => update(theme, 'avatarShape', value as typeof theme.avatarShape)
        ),
        imageField(
          'avatarFrame',
          theme.avatarFrame,
          'themeAvatarFrame',
          (value) => update(theme, 'avatarFrame', value, true),
          upload
        ),
        el<HTMLElement>(
          <label class="theme-marker-toggle">
            <input
              type="checkbox"
              data-theme-field="messageMarkEnabled"
              checked={!!theme.messageMark}
              onChange={(event: Event) =>
                update(
                  theme,
                  'messageMark',
                  (event.target as HTMLInputElement).checked ? '#989898' : '',
                  true
                )
              }
            />
            {message('themeAddMessageMark')}
          </label>
        ),
        ...(theme.messageMark
          ? [
              colorField('messageMark', theme.messageMark, 'themeMarkerColor', (value) =>
                update(theme, 'messageMark', value)
              )
            ]
          : [])
      ])}
    </div>
  );
}

export function themeBackgroundFields(
  theme: CustomTheme,
  area: ThemeArea,
  update: UpdateTheme,
  upload: UploadImage
): HTMLElement {
  const surface = theme.surfaces[area];
  const image = (key: 'image' | 'darkImage', label: string) =>
    imageField(key, surface[key], label, (value) => update(surface, key, value, true), upload);
  return el<HTMLElement>(
    <div class="theme-background-fields theme-fields-content">
      {[
        selectField(
          'fill',
          surface.fill,
          'themeFill',
          ['theme', 'solid', 'gradient', 'image'],
          (value) => update(surface, 'fill', value as typeof surface.fill, true)
        ),
        ...(surface.fill === 'solid' || surface.fill === 'gradient'
          ? [
              el<HTMLElement>(
                <div class="theme-colors">
                  {colorField('color', surface.color, 'themeBackgroundColor', (value) =>
                    update(surface, 'color', value)
                  )}
                  {surface.fill === 'gradient'
                    ? colorField(
                        'gradientColor',
                        surface.gradientColor,
                        'themeGradientColor',
                        (value) => update(surface, 'gradientColor', value)
                      )
                    : null}
                </div>
              )
            ]
          : []),
        ...(surface.fill === 'gradient'
          ? [
              rangeField(
                'gradientAngle',
                surface.gradientAngle,
                'themeGradientAngle',
                360,
                '°',
                (value) => update(surface, 'gradientAngle', value)
              )
            ]
          : []),
        ...(surface.fill === 'image'
          ? [
              image('image', 'themeChooseImage'),
              image('darkImage', 'themeDarkImage'),
              selectField(
                'imageText',
                surface.imageText,
                'themeImageText',
                ['auto', 'light', 'dark'],
                (value) => update(surface, 'imageText', value as typeof surface.imageText)
              ),
              el<HTMLElement>(<p class="theme-field-hint">{message('themeImageTextHint')}</p>),
              section('themeImagePlacement', [
                selectField(
                  'fit',
                  surface.fit,
                  'themeFit',
                  ['cover', 'contain', 'repeat', 'stretch', 'banner'],
                  (value) => update(surface, 'fit', value as typeof surface.fit, true)
                ),
                ...(surface.fit === 'banner'
                  ? [
                      rangeField(
                        'imageHeight',
                        surface.imageHeight,
                        'themeImageHeight',
                        400,
                        'px',
                        (value) => update(surface, 'imageHeight', value),
                        20
                      )
                    ]
                  : []),
                rangeField(
                  'zoom',
                  surface.zoom,
                  'themeZoom',
                  300,
                  '%',
                  (value) => update(surface, 'zoom', value),
                  100
                ),
                ...(surface.fit !== 'stretch' && surface.fit !== 'banner'
                  ? [
                      rangeField(
                        'positionX',
                        surface.positionX,
                        'themePositionX',
                        100,
                        '%',
                        (value) => update(surface, 'positionX', value)
                      )
                    ]
                  : []),
                ...(surface.fit !== 'stretch'
                  ? [
                      rangeField('position', surface.position, 'themePosition', 100, '%', (value) =>
                        update(surface, 'position', value)
                      )
                    ]
                  : []),
                rangeField('opacity', surface.opacity, 'themeVisibility', 100, '%', (value) =>
                  update(surface, 'opacity', value)
                )
              ])
            ]
          : []),
        ...(surface.fill !== 'theme'
          ? [
              rangeField(
                'surfaceOpacity',
                surface.surfaceOpacity,
                'themeSurfaceOpacity',
                100,
                '%',
                (value) => update(surface, 'surfaceOpacity', value)
              )
            ]
          : [])
      ]}
    </div>
  );
}
