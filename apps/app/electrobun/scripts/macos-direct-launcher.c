#include <errno.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int fail(const char *message) {
  fprintf(stderr, "%s: %s\n", message, strerror(errno));
  return 111;
}

int main(void) {
  uint32_t executable_path_size = 0;
  _NSGetExecutablePath(NULL, &executable_path_size);

  char *executable_path = malloc((size_t)executable_path_size + 1U);
  if (executable_path == NULL) {
    fputs("failed to allocate executable path buffer\n", stderr);
    return 111;
  }

  if (_NSGetExecutablePath(executable_path, &executable_path_size) != 0) {
    free(executable_path);
    fputs("failed to resolve executable path\n", stderr);
    return 111;
  }

  char resolved_path[PATH_MAX];
  if (realpath(executable_path, resolved_path) == NULL) {
    free(executable_path);
    return fail("failed to canonicalize executable path");
  }
  free(executable_path);

  char *last_slash = strrchr(resolved_path, '/');
  if (last_slash == NULL) {
    fputs("unexpected executable path format\n", stderr);
    return 111;
  }
  *last_slash = '\0';

  if (chdir(resolved_path) != 0) {
    return fail("failed to change into launcher directory");
  }

  char *const child_argv[] = {"./bun", "../Resources/main.js", NULL};
  execv(child_argv[0], child_argv);
  return fail("failed to exec bundled bun runtime");
}
