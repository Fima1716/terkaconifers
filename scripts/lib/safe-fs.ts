/**
 * Запись файлов «всё или ничего».
 *
 * Обычные writeFileSync/copyFileSync сначала обнуляют старый файл, а потом
 * пишут новый. 29.10 диск был полон: копия каталога в public/data обнулилась,
 * новая не записалась, и сайт показал 0 сортов. Здесь пишем во временный
 * файл рядом и подменяем им старый одним rename — при любой ошибке старый
 * файл остаётся целым.
 *
 * Те же имена и аргументы, что у fs, — достаточно поменять импорт.
 */
import { writeFileSync as fsWriteFileSync, copyFileSync as fsCopyFileSync, renameSync, rmSync } from 'fs'

function replaceVia(path: string, write: (tmp: string) => void) {
  const tmp = `${path}.tmp-${process.pid}`
  try {
    write(tmp)
    renameSync(tmp, path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

export function writeFileSync(path: string, data: string | NodeJS.ArrayBufferView) {
  replaceVia(path, tmp => fsWriteFileSync(tmp, data))
}

export function copyFileSync(src: string, dest: string) {
  replaceVia(dest, tmp => fsCopyFileSync(src, tmp))
}
