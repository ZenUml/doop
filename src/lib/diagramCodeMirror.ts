import CodeMirror from 'codemirror'
import type { StringStream, EditorConfiguration } from 'codemirror'

import 'codemirror/addon/comment/comment.js'
import 'codemirror/addon/edit/closebrackets.js'
import 'codemirror/addon/edit/matchbrackets.js'
import 'codemirror/addon/search/search.js'
import 'codemirror/lib/codemirror.css'
import '../components/diagram-code-editor.css'

const ZENUML_WORDS = new Set([
  'title',
  'if',
  'else',
  'return',
  'throw',
  'try',
  'catch',
  'finally',
  'loop',
  'while',
  'for',
  'par',
  'alt',
  'opt',
  'critical',
  'break',
  'continue',
  'group',
  'async',
  'await',
  'new',
  'true',
  'false',
  'null',
])
const MERMAID_WORDS = new Set([
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitGraph',
  'C4Context',
  'subgraph',
  'end',
  'direction',
  'participant',
  'actor',
  'as',
  'activate',
  'deactivate',
  'autonumber',
  'loop',
  'alt',
  'else',
  'opt',
  'par',
  'and',
  'rect',
  'note',
  'over',
  'left',
  'right',
  'of',
  'with',
  'class',
  'click',
  'style',
  'linkStyle',
  'classDef',
  'TB',
  'TD',
  'BT',
  'LR',
  'RL',
  'true',
  'false',
])

function word(stream: StringStream, keywords: Set<string>) {
  stream.eatWhile(/[\w$.-]/)
  const value = stream.current()
  return keywords.has(value) ? 'keyword' : /^[A-Z]/.test(value) ? 'variable-2' : 'variable'
}

function makeMode(kind: 'zenuml' | 'mermaid') {
  const keywords = kind === 'zenuml' ? ZENUML_WORDS : MERMAID_WORDS
  return {
    startState: () => ({ inBlockComment: false }),
    token(stream: StringStream, state: { inBlockComment: boolean }) {
      if (state.inBlockComment) {
        if (stream.skipTo('*/')) {
          stream.match('*/')
          state.inBlockComment = false
        } else stream.skipToEnd()
        return 'comment'
      }
      if (stream.eatSpace()) return null
      if ((kind === 'mermaid' && stream.match('%%')) || (kind === 'zenuml' && stream.match('//'))) {
        stream.skipToEnd()
        return 'comment'
      }
      if (kind === 'zenuml' && stream.match('/*')) {
        state.inBlockComment = true
        return 'comment'
      }
      if (stream.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/)) return 'string'
      if (kind === 'zenuml' && stream.match(/@[\w-]+/)) return 'meta'
      if (stream.match(/(?:--?>|<--?|==>|-->>|->>|-\.->|--o|--x|<\.\.>|<->|=>|:)/)) return 'operator'
      if (stream.match(/\d+(?:\.\d+)?/)) return 'number'
      if (stream.match(/[{}()[\]]/)) return 'bracket'
      if (stream.match(/[,.]/)) return 'punctuation'
      if (stream.match(/[\w$]/)) return word(stream, keywords)
      stream.next()
      return null
    },
  }
}

CodeMirror.defineMode('diagramly-zenuml', () => makeMode('zenuml'))
CodeMirror.defineMode('diagramly-mermaid', () => makeMode('mermaid'))

export { CodeMirror }
export type { EditorConfiguration }
