interface SharedText {
  title: string;
  text: string;
  url: string;
}

export const composeSharedContent = ({ title, text, url }: SharedText): string => {
  const sharedTitle = title.trim();
  const sharedText = text.trim();
  const sharedUrl = url.trim();
  const parts: string[] = [];

  if (sharedTitle && sharedTitle !== sharedUrl && !sharedText.split(/\r?\n/).includes(sharedTitle)) {
    parts.push(sharedTitle);
  }
  if (sharedText) parts.push(sharedText);
  if (sharedUrl && !sharedText.includes(sharedUrl)) parts.push(sharedUrl);

  return parts.join('\n\n');
};
