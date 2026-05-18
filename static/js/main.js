/* Entry point: orchestrates config loading, rendering, and re-rendering.
   In Flask mode, fetches from /api/config which provides model + tuples
   enriched with users from Keycloak, LDAP, or static config.
   In static mode (file:// or no backend), uses DEFAULT_CONFIG from data.js. */

document.addEventListener('DOMContentLoaded', function () {
  var currentConfig = null;
  var defaultJsonText = '';
  var isStaticMode = (window.location.protocol === 'file:');

  function reRenderAll() {
    var parsed = parseModel(currentConfig.model);
    ColorModes.buildPalette(parsed, currentConfig.tuples);

    renderModel(parsed, document.getElementById('model-content'));
    renderTuples(currentConfig.tuples, document.getElementById('tuples-content'),
      document.getElementById('tuples-count'));
    renderGraph(parsed, currentConfig.tuples, document.getElementById('graph-content'));
    initCheckUI(parsed, currentConfig.tuples, document.getElementById('check-panel'));
  }

  function showUserSource(source) {
    var badge = document.getElementById('user-source-badge');
    if (badge && source) {
      badge.textContent = 'Users: ' + source;
    }
  }

  var editorCtrl = null;
  var projectTests = [];
  var customTests = [];

  function onTestsLoaded(tests) {
    projectTests = tests || [];
    updateTestDropdown();
  }

  function updateTestDropdown() {
    var allTests = projectTests.concat(customTests);
    var select = document.getElementById('test-select');
    if (!select) return;

    var prev = select.value;
    select.innerHTML = '<option value="">-- select test --</option>';
    for (var i = 0; i < allTests.length; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      var label = allTests[i].name;
      if (allTests[i].source === 'custom') label = '[custom] ' + label;
      opt.textContent = label;
      select.appendChild(opt);
    }
    // Restore selection if still valid
    if (prev && select.querySelector('option[value="' + prev + '"]')) {
      select.value = prev;
    }
  }

  function getAllTests() {
    return projectTests.concat(customTests);
  }

  function initApp(config) {
    currentConfig = { model: config.model, tuples: config.tuples };

    // Show user source badge
    showUserSource(config.user_source || (isStaticMode ? 'static (offline)' : 'static'));

    // Build formatted JSON text showing only model + tuples (the editable schema)
    defaultJsonText = JSON.stringify(currentConfig, null, 2);

    // Initialize schema editor
    editorCtrl = initEditor(
      document.getElementById('config-content'),
      defaultJsonText,
      function onApply(newConfig) {
        currentConfig = newConfig;
        reRenderAll();
      },
      {
        fgaAvailable: !isStaticMode && !!config.fga_available,
        backendAvailable: !isStaticMode,
        defaultProjectUrl: isStaticMode ? 'static/configs/openfga-authz-sample.zip' : '/static/configs/openfga-authz-sample.zip',
        onTestsLoaded: onTestsLoaded
      }
    );

    // Initial render
    reRenderAll();

    // Restore project from sessionStorage if available
    editorCtrl.restoreFromSession();
  }

  // Config panel toggle
  var configToggle = document.getElementById('config-toggle');
  configToggle.addEventListener('click', function () {
    var configPanel = document.getElementById('config-panel');
    var modelPanel = document.getElementById('model-panel');
    configPanel.classList.toggle('collapsed');
    modelPanel.classList.toggle('expanded');
  });

  // Editor mode toggle (single file vs upload project)
  var modeToggle = document.getElementById('editor-mode-toggle');
  modeToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.mode-btn');
    if (!btn) return;
    var mode = btn.getAttribute('data-mode');
    var btns = modeToggle.querySelectorAll('.mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i] === btn);
    }
    if (editorCtrl) editorCtrl.setMode(mode);
  });

  // Color mode switcher
  var colorModeSelect = document.getElementById('color-mode-select');
  colorModeSelect.addEventListener('change', function () {
    ColorModes.setMode(this.value);
    reRenderAll();
  });

  // -- Test management --

  var testLoadBtn = document.getElementById('test-load-btn');
  var testRunBtn = document.getElementById('test-run-btn');
  var testDeleteBtn = document.getElementById('test-delete-btn');
  var saveQueryBtn = document.getElementById('save-query-btn');
  var testSelect = document.getElementById('test-select');
  var testResultsDiv = document.getElementById('test-results');

  function getSelectedTest() {
    var idx = testSelect.value;
    if (idx === '') return null;
    var all = getAllTests();
    return all[parseInt(idx)] || null;
  }

  // Load: populate check fields with first assertion from selected test
  testLoadBtn.addEventListener('click', function () {
    var test = getSelectedTest();
    if (!test || !test.checks || test.checks.length === 0) return;
    var first = test.checks[0];
    var userSel = document.getElementById('check-user');
    var relSel = document.getElementById('check-relation');
    var objSel = document.getElementById('check-object');
    setSelectValue(userSel, first.user) || (userSel.selectedIndex = 0);
    setSelectValue(relSel, first.relation) || (relSel.selectedIndex = 0);
    setSelectValue(objSel, first.object) || (objSel.selectedIndex = 0);
    testResultsDiv.style.display = 'none';
  });

  // Run: execute all assertions from the selected test
  testRunBtn.addEventListener('click', function () {
    var test = getSelectedTest();
    if (!test || !test.checks || test.checks.length === 0) return;
    if (!currentConfig) return;

    // Build tuples: base tuples + any extraTuples from the test
    var allTuples = currentConfig.tuples.slice();
    if (test.extraTuples) {
      for (var t = 0; t < test.extraTuples.length; t++) {
        allTuples.push(test.extraTuples[t]);
      }
    }

    var parsed = parseModel(currentConfig.model);
    var engine = createCheckEngine(parsed, allTuples);
    var passed = 0;
    var failed = 0;
    var rows = '';

    for (var i = 0; i < test.checks.length; i++) {
      var c = test.checks[i];
      var result = engine.check(c.user, c.relation, c.object);
      var ok = result.allowed === c.expected;
      if (ok) passed++;
      else failed++;

      var statusClass = ok ? 'pass' : 'fail';
      var statusText = ok ? 'PASS' : 'FAIL';
      rows += '<div class="test-assertion-row">' +
        '<span class="assertion-status ' + statusClass + '">' + statusText + '</span>' +
        '<span class="assertion-query">' +
          escapeHtml(c.user) + ' ' + escapeHtml(c.relation) + ' ' + escapeHtml(c.object) +
        '</span>' +
        '<span class="assertion-expected">expected: ' + c.expected + '</span>' +
        '</div>';
    }

    var summaryClass = failed === 0 ? 'all-pass' : 'has-fail';
    var summaryText = passed + '/' + (passed + failed) + ' passed';
    testResultsDiv.innerHTML =
      '<div class="test-results-header">' +
        '<span>Test Results</span>' +
        '<span class="test-results-summary ' + summaryClass + '">' + summaryText + '</span>' +
      '</div>' + rows;
    testResultsDiv.style.display = '';
  });

  // Delete: remove a custom test
  testDeleteBtn.addEventListener('click', function () {
    var idx = parseInt(testSelect.value);
    if (isNaN(idx)) return;
    var all = getAllTests();
    var test = all[idx];
    if (!test || test.source !== 'custom') return;
    var customIdx = idx - projectTests.length;
    if (customIdx >= 0 && customIdx < customTests.length) {
      customTests.splice(customIdx, 1);
      updateTestDropdown();
      testResultsDiv.style.display = 'none';
    }
  });

  // Save: save current check query as a custom test
  saveQueryBtn.addEventListener('click', function () {
    var userSel = document.getElementById('check-user');
    var relSel = document.getElementById('check-relation');
    var objSel = document.getElementById('check-object');
    var user = userSel.value;
    var relation = relSel.value;
    var object = objSel.value;
    if (!user || !relation || !object) return;

    // Check if this exact check already exists in custom tests
    for (var i = 0; i < customTests.length; i++) {
      var checks = customTests[i].checks;
      if (checks.length === 1 &&
          checks[0].user === user &&
          checks[0].relation === relation &&
          checks[0].object === object) {
        return; // Already exists
      }
    }

    // Run the check to determine expected result
    if (!currentConfig) return;
    var parsed = parseModel(currentConfig.model);
    var engine = createCheckEngine(parsed, currentConfig.tuples);
    var result = engine.check(user, relation, object);

    customTests.push({
      name: user + ' ' + relation + ' ' + object,
      source: 'custom',
      checks: [{ user: user, relation: relation, object: object, expected: result.allowed }],
      extraTuples: [],
    });
    updateTestDropdown();
    // Select the newly added test
    testSelect.value = String(getAllTests().length - 1);
  });

  // Load config: try Flask backend first, fall back to embedded default
  if (isStaticMode) {
    initApp(DEFAULT_CONFIG);
  } else {
    fetch('/api/config')
      .then(function (r) {
        if (!r.ok) throw new Error('API fetch failed');
        return r.json();
      })
      .then(function (config) {
        initApp(config);
      })
      .catch(function () {
        // No backend available -- switch to static mode
        isStaticMode = true;
        initApp(DEFAULT_CONFIG);
      });
  }
});
