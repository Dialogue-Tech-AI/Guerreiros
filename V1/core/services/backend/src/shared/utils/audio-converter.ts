/**
 * Converte áudio WebM (MediaRecorder do navegador) para formato compatível com WhatsApp.
 * WhatsApp não aceita audio/webm - OGG/Opus e MP4/AAC são suportados.
 */
import * as child_process from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { logger } from './logger';

let ffmpegPathConfigured = false;

/** Garante que fluent-ffmpeg use o binário correto (ffmpeg-static no projeto ou PATH do sistema). */
function ensureFfmpegPath(): void {
  if (ffmpegPathConfigured) return;
  let pathToUse = ffmpegPath && typeof ffmpegPath === 'string' ? ffmpegPath : null;
  if (!pathToUse && process.platform === 'win32') {
    try {
      const result = child_process.spawnSync('where', ['ffmpeg'], { encoding: 'utf8' });
      pathToUse = result.stdout?.split('\n')[0]?.trim() || null;
      if (pathToUse && !pathToUse.endsWith('.exe')) pathToUse = null;
    } catch {
      // ignora
    }
  }
  if (pathToUse) {
    ffmpeg.setFfmpegPath(pathToUse);
    ffmpegPathConfigured = true;
    logger.debug('ffmpeg path configured', { path: pathToUse });
  }
}

export async function convertWebmToOgg(webmBuffer: Buffer): Promise<Buffer> {
  ensureFfmpegPath();
  const tmpDir = os.tmpdir();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(tmpDir, `audio-in-${suffix}.webm`);
  const outputPath = path.join(tmpDir, `audio-out-${suffix}.ogg`);
  try {
    await fs.writeFile(inputPath, webmBuffer);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-acodec libopus', '-b:a 64k'])
        .format('ogg')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
    const oggBuffer = await fs.readFile(outputPath);
    return oggBuffer;
  } catch (err: unknown) {
    logger.error('convertWebmToOgg failed', {
      error: err instanceof Error ? err.message : String(err),
      inputSize: webmBuffer.length,
    });
    throw err;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

/** Converte WebM para MP4/AAC - melhor compatibilidade no WhatsApp (formato nativo iOS). */
export async function convertWebmToMp4(webmBuffer: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  return normalizeAudioToMp4(webmBuffer, '.webm');
}

/**
 * Normaliza qualquer áudio (webm, mp4, ogg) para MP4/AAC compatível com WhatsApp.
 * Re-encoda para corrigir gravações do MediaRecorder que podem ser fragmentadas ou malformadas.
 */
export async function normalizeAudioToMp4(audioBuffer: Buffer, inputExt: string = '.webm'): Promise<{ buffer: Buffer; mimeType: string }> {
  ensureFfmpegPath();
  const tmpDir = os.tmpdir();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(tmpDir, `audio-in-${suffix}${inputExt}`);
  const outputPath = path.join(tmpDir, `audio-out-${suffix}.m4a`);
  try {
    await fs.writeFile(inputPath, audioBuffer);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-acodec aac',
          '-b:a 96k',
          '-ar 44100',
          '-ac 1',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
    const mp4Buffer = await fs.readFile(outputPath);
    logger.info('Audio normalized for WhatsApp', {
      inputSize: audioBuffer.length,
      outputSize: mp4Buffer.length,
      inputExt,
    });
    return { buffer: mp4Buffer, mimeType: 'audio/mp4' };
  } catch (err: unknown) {
    logger.error('normalizeAudioToMp4 failed', {
      error: err instanceof Error ? err.message : String(err),
      inputSize: audioBuffer.length,
      inputExt,
    });
    throw err;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
