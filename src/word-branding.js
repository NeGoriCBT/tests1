/** Логотип Mental Help для документа Word (файл в public/assets/logo.png). */

const LOGO_WIDTH = 148;
const LOGO_HEIGHT = 70;

/** @returns {string} */
export function getBrandLogoUrl() {
  const base = import.meta.env.BASE_URL || "./";
  return `${base}assets/logo.png`;
}

/** @returns {Promise<Uint8Array | null>} */
export async function fetchBrandLogoData() {
  try {
    const res = await fetch(getBrandLogoUrl());
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * @param {typeof import("docx").Paragraph} Paragraph
 * @param {typeof import("docx").ImageRun} ImageRun
 * @param {Uint8Array | null} logoData
 */
export function buildWordLogoBlock(Paragraph, ImageRun, logoData) {
  if (!logoData?.length) return [];
  return [
    new Paragraph({
      children: [
        new ImageRun({
          data: logoData,
          transformation: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];
}
