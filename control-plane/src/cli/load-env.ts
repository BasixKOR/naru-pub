// Next loads .env on its own, but a plain node or tsx script does not. Load
// the same file Next would. Variables already in the environment win, which in
// the containers is all of them: compose passes .env as env_file and there is
// no file to read, so a missing one is not an error.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
