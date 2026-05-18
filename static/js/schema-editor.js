/* Schema editor: two modes -- single-file JSON editing, and project zip upload.
   options.fgaAvailable controls whether the Validate button is enabled.
   options.defaultProjectUrl is the URL to fetch the default project zip. */

function initEditor(container, defaultJsonText, onApply, options) {
  var originalText = defaultJsonText;
  var opts = options || {};
  var currentMode = 'single';
  var projectZipBlob = null;
  var projectZipName = '';

  container.innerHTML = '';

  // -- Single-file mode view --

  var singleView = document.createElement('div');
  singleView.className = 'editor-view editor-view-single';

  var textarea = document.createElement('textarea');
  textarea.className = 'schema-editor-textarea';
  textarea.spellcheck = false;
  textarea.wrap = 'off';
  textarea.value = defaultJsonText;
  singleView.appendChild(textarea);

  var singleErrorDiv = document.createElement('div');
  singleErrorDiv.className = 'editor-error';
  singleView.appendChild(singleErrorDiv);

  var singleControls = document.createElement('div');
  singleControls.className = 'editor-controls';

  var applyBtn = createBtn('Apply', 'editor-btn-apply');
  singleControls.appendChild(applyBtn);

  var resetBtn = createBtn('Reset', 'editor-btn-reset');
  singleControls.appendChild(resetBtn);

  var formatBtn = createBtn('Format', 'editor-btn-format');
  singleControls.appendChild(formatBtn);

  var singleValidateBtn = createBtn('Validate', 'editor-btn-validate');
  if (!opts.fgaAvailable) {
    singleValidateBtn.disabled = true;
    singleValidateBtn.title = 'fga CLI not found on the server';
  }
  singleControls.appendChild(singleValidateBtn);

  var singleStatusSpan = document.createElement('span');
  singleStatusSpan.className = 'editor-status';
  singleControls.appendChild(singleStatusSpan);

  singleView.appendChild(singleControls);
  container.appendChild(singleView);

  // -- Project mode view --

  var projectView = document.createElement('div');
  projectView.className = 'editor-view editor-view-project';
  projectView.style.display = 'none';

  var projectInfo = document.createElement('div');
  projectInfo.className = 'project-info';
  projectInfo.innerHTML = '<span class="project-info-placeholder">No project loaded</span>';
  projectView.appendChild(projectInfo);

  var projectErrorDiv = document.createElement('div');
  projectErrorDiv.className = 'editor-error';
  projectView.appendChild(projectErrorDiv);

  var projectControls = document.createElement('div');
  projectControls.className = 'editor-controls';

  var uploadBtn = createBtn('Upload', 'editor-btn-upload');
  projectControls.appendChild(uploadBtn);

  var projectValidateBtn = createBtn('Validate', 'editor-btn-validate');
  if (!opts.fgaAvailable) {
    projectValidateBtn.disabled = true;
    projectValidateBtn.title = 'fga CLI not found on the server';
  }
  projectControls.appendChild(projectValidateBtn);

  var projectApplyBtn = createBtn('Apply', 'editor-btn-apply');
  projectControls.appendChild(projectApplyBtn);

  // In static mode (no Flask), Validate is always disabled but Upload/Apply work client-side
  if (!opts.backendAvailable) {
    projectValidateBtn.disabled = true;
    projectValidateBtn.title = 'Requires Flask backend for fga CLI validation';
  }

  var projectStatusSpan = document.createElement('span');
  projectStatusSpan.className = 'editor-status';
  projectControls.appendChild(projectStatusSpan);

  projectView.appendChild(projectControls);

  // Hidden file input for zip upload
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.zip';
  fileInput.style.display = 'none';
  projectView.appendChild(fileInput);

  container.appendChild(projectView);

  // -- Helpers --

  function createBtn(label, extraClass) {
    var btn = document.createElement('button');
    btn.className = 'editor-btn ' + extraClass;
    btn.textContent = label;
    btn.type = 'button';
    return btn;
  }

  function validate(text) {
    try {
      var parsed = JSON.parse(text);
      if (!parsed.model || !parsed.tuples) {
        return { error: 'JSON must have "model" and "tuples" keys' };
      }
      if (!parsed.model.type_definitions) {
        return { error: 'model must have "type_definitions" array' };
      }
      if (!Array.isArray(parsed.tuples)) {
        return { error: '"tuples" must be an array' };
      }
      return { parsed: parsed };
    } catch (e) {
      return { error: e.message };
    }
  }

  function showStatus(statusEl, errorEl, text, isError) {
    if (isError) {
      errorEl.textContent = text;
      statusEl.textContent = '';
    } else {
      errorEl.textContent = '';
      statusEl.textContent = text;
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  function renderProjectInfo(name, size) {
    projectInfo.innerHTML =
      '<span class="project-info-name">' + name + '</span>' +
      '<span class="project-info-size">' + formatBytes(size) + '</span>';
  }

  // -- Single-file event handlers --

  applyBtn.addEventListener('click', function () {
    var result = validate(textarea.value);
    if (result.error) {
      showStatus(singleStatusSpan, singleErrorDiv, result.error, true);
    } else {
      showStatus(singleStatusSpan, singleErrorDiv, 'Applied', false);
      onApply(result.parsed);
    }
  });

  resetBtn.addEventListener('click', function () {
    textarea.value = originalText;
    singleErrorDiv.textContent = '';
    singleStatusSpan.textContent = '';
    var result = validate(originalText);
    if (!result.error) {
      onApply(result.parsed);
    }
  });

  formatBtn.addEventListener('click', function () {
    try {
      var parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      showStatus(singleStatusSpan, singleErrorDiv, 'Formatted', false);
    } catch (e) {
      showStatus(singleStatusSpan, singleErrorDiv, 'Cannot format: ' + e.message, true);
    }
  });

  singleValidateBtn.addEventListener('click', function () {
    if (singleValidateBtn.disabled) return;

    var result = validate(textarea.value);
    if (result.error) {
      showStatus(singleStatusSpan, singleErrorDiv, result.error, true);
      return;
    }

    singleValidateBtn.disabled = true;
    singleStatusSpan.textContent = 'Validating...';

    fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: result.parsed.model })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        singleValidateBtn.disabled = false;
        if (data.valid) {
          showStatus(singleStatusSpan, singleErrorDiv, 'Valid', false);
        } else {
          showStatus(singleStatusSpan, singleErrorDiv, data.error || 'Validation failed', true);
        }
      })
      .catch(function () {
        singleValidateBtn.disabled = false;
        showStatus(singleStatusSpan, singleErrorDiv, 'Validate request failed', true);
      });
  });

  textarea.addEventListener('input', function () {
    singleErrorDiv.textContent = '';
    singleStatusSpan.textContent = '';
  });

  // -- Project mode event handlers --

  uploadBtn.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    projectZipBlob = file;
    projectZipName = file.name;
    renderProjectInfo(file.name, file.size);
    showStatus(projectStatusSpan, projectErrorDiv, 'Loaded', false);
  });

  function applyProjectResult(data) {
    showStatus(projectStatusSpan, projectErrorDiv, 'Applied', false);
    onApply({ model: data.model, tuples: data.tuples });
    if (opts.onTestsLoaded && data.tests) {
      opts.onTestsLoaded(data.tests);
    }
    // Persist to sessionStorage
    try {
      sessionStorage.setItem('openfga-project', JSON.stringify({
        name: projectZipName,
        model: data.model,
        tuples: data.tuples,
        tests: data.tests || []
      }));
    } catch (e) {
      // sessionStorage may be unavailable or full
    }
  }

  function uploadAndApply() {
    if (!projectZipBlob) {
      showStatus(projectStatusSpan, projectErrorDiv, 'No project loaded', true);
      return;
    }

    projectApplyBtn.disabled = true;
    projectStatusSpan.textContent = 'Applying...';

    if (opts.backendAvailable) {
      // Flask mode: upload to backend
      var formData = new FormData();
      formData.append('file', projectZipBlob, projectZipName || 'project.zip');

      fetch('/api/project/apply', { method: 'POST', body: formData })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          projectApplyBtn.disabled = false;
          if (data.error) {
            showStatus(projectStatusSpan, projectErrorDiv, data.error, true);
            return;
          }
          applyProjectResult(data);
        })
        .catch(function () {
          projectApplyBtn.disabled = false;
          showStatus(projectStatusSpan, projectErrorDiv, 'Upload failed', true);
        });
    } else {
      // Static mode: parse client-side
      ProjectParser.parseProjectZip(projectZipBlob)
        .then(function (data) {
          projectApplyBtn.disabled = false;
          applyProjectResult(data);
        })
        .catch(function (err) {
          projectApplyBtn.disabled = false;
          showStatus(projectStatusSpan, projectErrorDiv, 'Parse failed: ' + err.message, true);
        });
    }
  }

  projectValidateBtn.addEventListener('click', function () {
    if (projectValidateBtn.disabled) return;
    if (!projectZipBlob) {
      showStatus(projectStatusSpan, projectErrorDiv, 'No project loaded', true);
      return;
    }

    projectValidateBtn.disabled = true;
    projectStatusSpan.textContent = 'Validating...';

    if (opts.backendAvailable) {
      // Flask mode: upload then validate via fga CLI
      var formData = new FormData();
      formData.append('file', projectZipBlob, projectZipName || 'project.zip');

      fetch('/api/project/apply', { method: 'POST', body: formData })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            projectValidateBtn.disabled = false;
            showStatus(projectStatusSpan, projectErrorDiv, data.error, true);
            return;
          }
          return fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: data.model })
          }).then(function (r) { return r.json(); })
            .then(function (vdata) {
              projectValidateBtn.disabled = false;
              if (vdata.valid) {
                showStatus(projectStatusSpan, projectErrorDiv, 'Valid', false);
              } else {
                showStatus(projectStatusSpan, projectErrorDiv, vdata.error || 'Validation failed', true);
              }
            });
        })
        .catch(function () {
          projectValidateBtn.disabled = false;
          showStatus(projectStatusSpan, projectErrorDiv, 'Validate request failed', true);
        });
    }
  });

  projectApplyBtn.addEventListener('click', function () {
    uploadAndApply();
  });

  // -- Mode switching --

  // Restore project from sessionStorage on init
  function restoreFromSession() {
    try {
      var saved = sessionStorage.getItem('openfga-project');
      if (saved) {
        var data = JSON.parse(saved);
        if (data.model && data.tuples) {
          projectZipName = data.name || 'restored project';
          renderProjectInfo(projectZipName, JSON.stringify(data).length);
          showStatus(projectStatusSpan, projectErrorDiv, 'Restored from session', false);
          onApply({ model: data.model, tuples: data.tuples });
          if (opts.onTestsLoaded && data.tests) {
            opts.onTestsLoaded(data.tests);
          }
          return true;
        }
      }
    } catch (e) {
      // sessionStorage unavailable or corrupt
    }
    return false;
  }

  function setMode(mode) {
    currentMode = mode;
    if (mode === 'project') {
      singleView.style.display = 'none';
      projectView.style.display = '';
      // Load default project zip if none loaded yet
      if (!projectZipBlob && opts.defaultProjectUrl && window.location.protocol !== 'file:') {
        projectStatusSpan.textContent = 'Loading default project...';
        fetch(opts.defaultProjectUrl)
          .then(function (r) {
            if (!r.ok) throw new Error('Failed to fetch');
            return r.blob();
          })
          .then(function (blob) {
            projectZipBlob = blob;
            projectZipName = 'openfga-authz-sample.zip';
            renderProjectInfo(projectZipName, blob.size);
            showStatus(projectStatusSpan, projectErrorDiv, 'Default project loaded', false);
          })
          .catch(function () {
            showStatus(projectStatusSpan, projectErrorDiv, 'Failed to load default project', true);
          });
      }
    } else {
      singleView.style.display = '';
      projectView.style.display = 'none';
    }
  }

  return { setMode: setMode, restoreFromSession: restoreFromSession };
}
