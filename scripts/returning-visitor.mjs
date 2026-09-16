// Feature checks start as returning visitors; tour-browser-check covers onboarding.
const configured = new WeakSet();
export async function returningVisitor(page) {
  if (configured.has(page)) return;
  await page.addInitScript(() => {
    localStorage.setItem('work-and-ai:guided-tour:v1', 'seen');
  });
  configured.add(page);
}
