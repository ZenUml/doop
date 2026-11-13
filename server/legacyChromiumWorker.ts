import { readLegacyChromiumLibrary } from './legacyChromium.ts'

// No input, output, file paths or V8 error details are logged. Only a complete
// validated JSON export goes to the parent's bounded stdout pipe.
let input = ''
for await (const chunk of process.stdin) {
  input += String(chunk)
  if (input.length > 8192) process.exit(1)
}
try {
  const request: unknown = JSON.parse(input)
  if (
    !request ||
    typeof request !== 'object' ||
    !('directory' in request) ||
    typeof request.directory !== 'string' ||
    request.directory.length > 4096
  )
    process.exit(1)
  const items = await readLegacyChromiumLibrary(request.directory)
  process.stdout.write(JSON.stringify(items))
} catch {
  process.exitCode = 1
}
