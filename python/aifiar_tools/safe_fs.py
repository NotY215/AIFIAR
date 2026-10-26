from __future__ import annotations

import errno
import os
import secrets
import stat
import tempfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from typing import Iterator


def _no_follow_flag() -> int:
    return getattr(os, "O_NOFOLLOW", 0)


def _directory_flag() -> int:
    return getattr(os, "O_DIRECTORY", 0)


def _supports_dirfd() -> bool:
    required = (os.open, os.stat, os.mkdir, os.unlink, os.rename)
    return all(callable(item) and item in os.supports_dir_fd for item in required)


class SecureWorkspace:
    """Workspace file operations using directory descriptors where supported.

    POSIX dirfd mode prevents symlink traversal in each opened path component.
    The path-based fallback rechecks paths but cannot eliminate all TOCTOU races;
    callers should use a disposable workspace on platforms without dirfd support.
    """

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir():
            raise ValueError("Workspace root must be a directory.")
        self._dirfd_supported = _supports_dirfd() and bool(_directory_flag()) and bool(_no_follow_flag())
        self._root_fd: int | None = None
        if self._dirfd_supported:
            self._root_fd = os.open(self.root, os.O_RDONLY | _directory_flag() | getattr(os, "O_CLOEXEC", 0))

    @property
    def race_resistant(self) -> bool:
        return self._dirfd_supported

    def close(self) -> None:
        if self._root_fd is not None:
            os.close(self._root_fd)
            self._root_fd = None

    def _parts(self, relative: str) -> tuple[list[str], str]:
        if not isinstance(relative, str) or not relative or "\x00" in relative or "\\" in relative:
            raise ValueError("Unsafe relative path.")
        path = PurePosixPath(relative)
        if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
            raise ValueError("Unsafe relative path: " + relative)
        if not path.parts:
            raise ValueError("A file path is required.")
        return list(path.parts[:-1]), path.parts[-1]

    @contextmanager
    def _parent(self, relative: str, *, create_dirs: bool = False) -> Iterator[tuple[int | None, Path, str]]:
        parents, name = self._parts(relative)
        if self._dirfd_supported:
            assert self._root_fd is not None
            fd = os.dup(self._root_fd)
            try:
                for part in parents:
                    try:
                        next_fd = os.open(part, os.O_RDONLY | _directory_flag() | _no_follow_flag() | getattr(os, "O_CLOEXEC", 0), dir_fd=fd)
                    except FileNotFoundError:
                        if not create_dirs:
                            raise
                        try:
                            os.mkdir(part, mode=0o755, dir_fd=fd)
                        except FileExistsError:
                            pass
                        next_fd = os.open(part, os.O_RDONLY | _directory_flag() | _no_follow_flag() | getattr(os, "O_CLOEXEC", 0), dir_fd=fd)
                    os.close(fd)
                    fd = next_fd
                yield fd, self.root.joinpath(*parents), name
            finally:
                try:
                    os.close(fd)
                except OSError:
                    pass
            return

        parent = self.root
        for part in parents:
            parent = parent / part
            if parent.is_symlink():
                raise ValueError("Symlink path is not permitted: " + relative)
            if not parent.exists() and create_dirs:
                parent.mkdir(mode=0o755)
            if not parent.is_dir():
                raise ValueError("Parent directory is missing or not a directory: " + relative)
        resolved_parent = parent.resolve(strict=True)
        if resolved_parent != self.root and self.root not in resolved_parent.parents:
            raise ValueError("Path escapes workspace root: " + relative)
        yield None, parent, name

    def exists(self, relative: str) -> bool:
        with self._parent(relative) as (fd, parent, name):
            if fd is not None:
                try:
                    os.stat(name, dir_fd=fd, follow_symlinks=False)
                    return True
                except FileNotFoundError:
                    return False
            path = parent / name
            try:
                path.lstat()
                return True
            except FileNotFoundError:
                return False

    def read(self, relative: str) -> tuple[bytes, int]:
        with self._parent(relative) as (fd, parent, name):
            if fd is not None:
                file_fd = os.open(name, os.O_RDONLY | _no_follow_flag() | getattr(os, "O_CLOEXEC", 0), dir_fd=fd)
                try:
                    info = os.fstat(file_fd)
                    if not stat.S_ISREG(info.st_mode):
                        raise ValueError("Target is not a regular file: " + relative)
                    chunks: list[bytes] = []
                    while True:
                        chunk = os.read(file_fd, 1024 * 1024)
                        if not chunk:
                            break
                        chunks.append(chunk)
                    return b"".join(chunks), stat.S_IMODE(info.st_mode)
                finally:
                    os.close(file_fd)
            path = parent / name
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
                raise ValueError("Target is not a regular non-symlink file: " + relative)
            with path.open("rb") as stream:
                opened = os.fstat(stream.fileno())
                if not stat.S_ISREG(opened.st_mode):
                    raise ValueError("Target is not a regular file: " + relative)
                return stream.read(), stat.S_IMODE(opened.st_mode)

    def atomic_write(self, relative: str, content: bytes, mode: int) -> None:
        with self._parent(relative, create_dirs=True) as (fd, parent, name):
            if fd is not None:
                temporary = ".aifiar-" + secrets.token_hex(12) + ".tmp"
                flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | _no_follow_flag() | getattr(os, "O_CLOEXEC", 0)
                temp_fd = os.open(temporary, flags, 0o600, dir_fd=fd)
                try:
                    view = memoryview(content)
                    while view:
                        written = os.write(temp_fd, view)
                        if written <= 0:
                            raise OSError("Short write while staging patch.")
                        view = view[written:]
                    os.fchmod(temp_fd, mode)
                    os.fsync(temp_fd)
                except Exception:
                    try:
                        os.unlink(temporary, dir_fd=fd)
                    except OSError:
                        pass
                    raise
                finally:
                    os.close(temp_fd)
                try:
                    os.rename(temporary, name, src_dir_fd=fd, dst_dir_fd=fd)
                    os.fsync(fd)
                except Exception:
                    try:
                        os.unlink(temporary, dir_fd=fd)
                    except OSError:
                        pass
                    raise
                return

            descriptor, temporary_name = tempfile.mkstemp(prefix=".aifiar-", suffix=".tmp", dir=str(parent))
            temporary_path = Path(temporary_name)
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
                    os.fchmod(stream.fileno(), mode)
                if (parent / name).is_symlink():
                    raise ValueError("Target became a symlink before replacement: " + relative)
                os.replace(temporary_path, parent / name)
            finally:
                try:
                    temporary_path.unlink()
                except FileNotFoundError:
                    pass

    def delete(self, relative: str) -> None:
        with self._parent(relative) as (fd, parent, name):
            if fd is not None:
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode):
                    raise ValueError("Delete target is not a regular file: " + relative)
                os.unlink(name, dir_fd=fd)
                os.fsync(fd)
                return
            path = parent / name
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
                raise ValueError("Delete target is not a regular non-symlink file: " + relative)
            path.unlink()
