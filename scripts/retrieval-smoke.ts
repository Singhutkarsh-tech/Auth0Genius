import { fetchDocument } from '../src/lib/research/network';
async function main() {
  for (const url of [
    'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    'https://docs.slack.dev/authentication/installing-with-oauth/',
  ]) {
    try {
      const result = await fetchDocument(url);
      console.log(
        JSON.stringify({
          url: result.url,
          title: result.title,
          readableCharacters: result.text.length,
        }),
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
main();
