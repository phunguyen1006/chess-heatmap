# Contributing to Chess.com Activity Heatmap

Thank you for your interest in contributing to Chess.com Activity Heatmap!

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/phunguyen1006/chess-heatmap.git
   cd chess-heatmap
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Build the extension:
   ```bash
   npm run build
   ```

5. Load unpacked extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `dist/` directory

## Pull Request Guidelines

- Ensure `npm run typecheck` passes with zero errors.
- Ensure `npm test` passes completely.
- Follow existing code conventions, clean imports, and modular architecture.
- Describe the motivation and changes clearly in the PR description.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
