document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-heat]');
  if (!button) return;
  const scope = button.closest('[data-heat-scope]') || document;
  const on = button.dataset.heat === 'on';
  const targets = scope.matches && scope.matches('[data-heat-target]') ? [scope] : scope.querySelectorAll('[data-heat-target]');
  targets.forEach((el) => el.classList.toggle('heat-off', !on));
  scope.querySelectorAll('[data-heat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.heat === button.dataset.heat)));
});
