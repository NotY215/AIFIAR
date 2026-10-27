import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts.language_checks import detect, safe_check_environment

class LanguageCheckTests(unittest.TestCase):
    def test_cpp_detects_cmake_without_executing_it(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "CMakeLists.txt").write_text("project(test)\n", encoding="utf-8")
            with patch("scripts.language_checks.shutil.which", side_effect=lambda name: "/tools/" + name):
                checks = detect("cpp", root)
            self.assertEqual(checks[0][0], "CMake configure")
            self.assertEqual(checks[0][1][:3], ("cmake", "-S", "."))

    def test_python_does_not_run_arbitrary_scripts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "pyproject.toml").write_text("[project]\nname='example'\n", encoding="utf-8")
            with patch("scripts.language_checks.shutil.which", return_value="/tools/python"):
                checks = detect("python", root)
            self.assertTrue(all(command[0] == "python" for _, command in checks))

    def test_check_environment_drops_secrets_and_arbitrary_variables(self):
        env = safe_check_environment({
            "PATH": "/tools", "HOME": "/home/test", "CI": "true",
            "OPENAI_API_KEY": "must-not-leak", "AWS_SECRET_ACCESS_KEY": "must-not-leak",
            "NPM_TOKEN": "must-not-leak", "CUSTOM_UNSAFE_FLAG": "1"
        })
        self.assertEqual(env, {"PATH": "/tools", "HOME": "/home/test", "CI": "true"})

    def test_sql_never_guesses_a_database_command(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "schema.sql").write_text("select 1;\n", encoding="utf-8")
            self.assertEqual(detect("sql", root), [])

    def test_unknown_build_layout_returns_no_commands(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch("scripts.language_checks.shutil.which", return_value=None):
                self.assertEqual(detect("cpp", Path(temp)), [])

if __name__ == "__main__":
    unittest.main()
