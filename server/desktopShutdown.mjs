import process from 'node:process'

// Loaded only by the bundled desktop server. The shell owns the write end
// of this pipe. EOF also arrives if the shell crashes or is force-quit.
process.stdin.once('end', () => process.kill(process.pid, 'SIGTERM'))
process.stdin.resume()
