"""Ejecutor de tests: vacía la caché antes de cada prueba, para que los
límites de peticiones y los bloqueos de una no afecten a la siguiente."""
import unittest

from django.core.cache import cache
from django.test.runner import DiscoverRunner


class _CleanCacheResult(unittest.TextTestResult):
    def startTest(self, test):
        cache.clear()
        super().startTest(test)


class CleanCacheTestRunner(DiscoverRunner):
    def get_resultclass(self):
        return super().get_resultclass() or _CleanCacheResult
