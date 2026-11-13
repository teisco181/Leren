import { connectGoogleDriveToken, getDriveAccessToken } from './firebase';

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          setOAuthToken: (token: string) => unknown;
          setCallback: (cb: (data: PickerResponse) => void) => unknown;
          setOrigin: (origin: string) => unknown;
          build: () => { setVisible: (visible: boolean) => void };
        };
        ViewId: {
          DOCS: unknown;
          DOCUMENTS: unknown;
          SPREADSHEETS: unknown;
          PRESENTATIONS: unknown;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
      };
    };
  }
}

interface PickerDoc {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}

export interface PickedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  itemType: 'gdoc' | 'gsheet' | 'gslide';
  content: string;
}

export function resolveDriveItemType(mimeType: string): 'gdoc' | 'gsheet' | 'gslide' {
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'gsheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'gslide';
  return 'gdoc';
}

function loadPickerLibrary(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }
    const waitForGapi = (attempts = 0) => {
      if (window.gapi) {
        window.gapi.load('picker', () => resolve());
      } else if (attempts > 30) {
        reject(new Error('Google Picker script kon niet worden geladen.'));
      } else {
        setTimeout(() => waitForGapi(attempts + 1), 150);
      }
    };
    waitForGapi();
  });
}

function extractTextFromSlideElements(elements: any[] = []): string[] {
  const chunks: string[] = [];
  for (const el of elements) {
    if (el.shape?.text?.textElements) {
      const txt = el.shape.text.textElements
        .map((te: any) => te.textRun?.content || '')
        .join('')
        .trim();
      if (txt) chunks.push(txt);
    }
    if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        const cells = (row.tableCells || [])
          .map((cell: any) =>
            (cell.text?.textElements || [])
              .map((te: any) => te.textRun?.content || '')
              .join('')
              .trim()
          )
          .filter(Boolean);
        if (cells.length > 0) chunks.push(cells.join(' | '));
      }
    }
  }
  return chunks;
}

async function fetchGoogleSheetText(fileId: string, accessToken: string): Promise<string> {
  // Fetch spreadsheet metadata first (never hardcode "Sheet1")
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=properties.title,sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const sheetTitles: string[] = (meta.sheets || [])
        .map((s: any) => s.properties?.title)
        .filter(Boolean)
        .slice(0, 6);

      const sections: string[] = [];
      for (const tabTitle of sheetTitles) {
        const range = `'${tabTitle.replace(/'/g, "''")}'`;
        const valRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (valRes.ok) {
          const valJson = await valRes.json();
          const rows: string[][] = valJson.values || [];
          if (rows.length > 0) {
            const formattedRows = rows
              .slice(0, 500)
              .map((r) => r.map((c) => String(c ?? '').trim()).join(' | '))
              .filter((line) => line.replace(/\|/g, '').trim().length > 0);
            sections.push(`=== Tabblad: ${tabTitle} ===\n${formattedRows.join('\n')}`);
          }
        }
      }
      if (sections.length > 0) {
        return sections.join('\n\n').slice(0, 250000);
      }
    }
  } catch (err) {
    console.warn('Sheets API fout, val terug op Drive CSV export:', err);
  }

  // Fallback to Drive CSV export
  const exportRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (exportRes.ok) {
    return (await exportRes.text()).slice(0, 250000);
  }
  return '';
}

async function fetchGoogleSlidesText(fileId: string, accessToken: string): Promise<string> {
  try {
    const presRes = await fetch(
      `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(fileId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (presRes.ok) {
      const pres = await presRes.json();
      const slides: any[] = pres.slides || [];
      const slideBlocks: string[] = [];
      slides.forEach((slide, idx) => {
        const bodyLines = extractTextFromSlideElements(slide.pageElements);
        const notesLines = extractTextFromSlideElements(
          slide.slideProperties?.notesPage?.pageElements
        );
        const parts: string[] = [`--- Dia ${idx + 1} ---`];
        if (bodyLines.length > 0) parts.push(bodyLines.join('\n'));
        if (notesLines.length > 0) parts.push(`[Sprekersnotities]: ${notesLines.join(' ')}`);
        if (bodyLines.length > 0 || notesLines.length > 0) {
          slideBlocks.push(parts.join('\n'));
        }
      });
      if (slideBlocks.length > 0) {
        return slideBlocks.join('\n\n').slice(0, 250000);
      }
    }
  } catch (err) {
    console.warn('Slides API fout, val terug op Drive tekst export:', err);
  }

  const exportRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (exportRes.ok) {
    return (await exportRes.text()).slice(0, 250000);
  }
  return '';
}

async function fetchDriveFileText(fileId: string, mimeType: string, accessToken: string): Promise<string> {
  try {
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return await fetchGoogleSheetText(fileId, accessToken);
    }
    if (mimeType === 'application/vnd.google-apps.presentation') {
      return await fetchGoogleSlidesText(fileId, accessToken);
    }
    if (mimeType === 'application/vnd.google-apps.document') {
      const exportRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (exportRes.ok) {
        return (await exportRes.text()).slice(0, 250000);
      }
      const docRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (docRes.ok) {
        const docJson = await docRes.json();
        const paragraphs: string[] = [];
        for (const el of docJson?.body?.content || []) {
          if (el.paragraph?.elements) {
            const line = el.paragraph.elements
              .map((pe: { textRun?: { content?: string } }) => pe.textRun?.content || '')
              .join('');
            paragraphs.push(line);
          }
        }
        return paragraphs.join('').slice(0, 250000);
      }
    } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const mediaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (mediaRes.ok) {
        return (await mediaRes.text()).slice(0, 250000);
      }
    }
  } catch (err) {
    console.warn('Kon Drive-inhoud niet volledig exporteren:', err);
  }
  return '';
}

export async function openGoogleDrivePicker(): Promise<PickedDriveFile | null> {
  let accessToken = getDriveAccessToken();
  if (!accessToken) {
    accessToken = await connectGoogleDriveToken();
  }

  await loadPickerLibrary();
  if (!window.google?.picker) {
    throw new Error('Google Picker kon niet worden geïnitialiseerd.');
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return new Promise((resolve, reject) => {
    try {
      const builder = new window.google!.picker.PickerBuilder() as any;
      builder.addView(window.google!.picker.ViewId.DOCS);
      if (window.google!.picker.ViewId.DOCUMENTS) {
        builder.addView(window.google!.picker.ViewId.DOCUMENTS);
      }
      if (window.google!.picker.ViewId.SPREADSHEETS) {
        builder.addView(window.google!.picker.ViewId.SPREADSHEETS);
      }
      if (window.google!.picker.ViewId.PRESENTATIONS) {
        builder.addView(window.google!.picker.ViewId.PRESENTATIONS);
      }

      const picker = builder
        .setOAuthToken(accessToken!)
        .setOrigin(pickerOrigin)
        .setCallback(async (data: PickerResponse) => {
          if (data.action === window.google!.picker.Action.PICKED && data.docs && data.docs[0]) {
            const picked = data.docs[0];
            const itemType = resolveDriveItemType(picked.mimeType);
            const content = await fetchDriveFileText(picked.id, picked.mimeType, accessToken!);
            const defaultUrl =
              itemType === 'gsheet'
                ? `https://docs.google.com/spreadsheets/d/${picked.id}/edit`
                : itemType === 'gslide'
                  ? `https://docs.google.com/presentation/d/${picked.id}/edit`
                  : picked.mimeType === 'application/vnd.google-apps.document'
                    ? `https://docs.google.com/document/d/${picked.id}/edit`
                    : `https://drive.google.com/file/d/${picked.id}/view`;

            resolve({
              id: picked.id,
              name: picked.name,
              mimeType: picked.mimeType,
              url: picked.url || defaultUrl,
              itemType,
              content:
                content ||
                `Google Drive-bestand gekoppeld: ${picked.name}. Open het bestand om de volledige inhoud te bekijken.`,
            });
          } else if (data.action === window.google!.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

export function getGoogleEmbedUrl(driveFileId: string, mimeType: string, fallbackUrl: string): string {
  if (!driveFileId) return fallbackUrl;
  if (mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${driveFileId}/preview`;
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return `https://docs.google.com/presentation/d/${driveFileId}/embed?start=false&loop=false&delayms=5000`;
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/preview`;
  }
  return `https://drive.google.com/file/d/${driveFileId}/preview`;
}
