import React from 'react';

export function FolderAnnotationEmptyState() {
  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-3xl p-12 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-2">Select a file to annotate</p>
        <p className="text-sm">
          Pick a markdown or HTML file from the sidebar to begin.
        </p>
      </div>
    </div>
  );
}
