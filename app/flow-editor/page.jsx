'use client';

import dynamic from 'next/dynamic';

// The editor reads the browser's saved graph when it opens.
const Editor = dynamic(() => import('./editor'), { ssr: false });

export default function FlowEditorPage() {
  return (
    <>
      <link rel="stylesheet" href="/flow-editor/appearance.css" />
      <link rel="stylesheet" href="/flow-editor/editor-ui.css" />
      <Editor />
    </>
  );
}
