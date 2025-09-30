// i18n Service
const i18n = {
  currentLang: 'fr',
  translations: {},
  
  async init() {
    // Detect browser language or load from localStorage
    const savedLang = localStorage.getItem('language');
    const browserLang = navigator.language.split('-')[0];
    this.currentLang = savedLang || (browserLang === 'en' ? 'en' : 'fr');
    
    await this.loadTranslations();
  },
  
  async loadTranslations() {
    try {
      const response = await fetch(`/locales/${this.currentLang}.json`);
      this.translations = await response.json();
    } catch (error) {
      console.error('Failed to load translations:', error);
      // Fallback to French if loading fails
      if (this.currentLang !== 'fr') {
        this.currentLang = 'fr';
        await this.loadTranslations();
      }
    }
  },
  
  async setLanguage(lang) {
    if (this.currentLang === lang) return;
    
    this.currentLang = lang;
    localStorage.setItem('language', lang);
    await this.loadTranslations();
    this.updatePage();
  },
  
  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }
    
    if (typeof value !== 'string') {
      console.warn(`Translation value is not a string: ${key}`);
      return key;
    }
    
    // Simple template replacement
    return value.replace(/\{\{(\w+)\}\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  },
  
  updatePage() {
    // Update document title
    document.title = this.t('app.title');
    
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const params = element.getAttribute('data-i18n-params');
      const parsedParams = params ? JSON.parse(params) : {};
      
      if (element.tagName === 'INPUT' && (element.type === 'submit' || element.type === 'button')) {
        element.value = this.t(key, parsedParams);
      } else if (element.hasAttribute('placeholder')) {
        element.placeholder = this.t(key, parsedParams);
      } else if (element.hasAttribute('title')) {
        element.title = this.t(key, parsedParams);
      } else if (element.hasAttribute('aria-label')) {
        element.setAttribute('aria-label', this.t(key, parsedParams));
      } else {
        element.textContent = this.t(key, parsedParams);
      }
    });
    
    // Update language selector
    updateLanguageSelector();
    
    // Refresh dynamic content
    if (state.session?.authenticated) {
      renderChannels();
      renderLogs();
      updatePagination();
    }
  }
};

const state = {
  session: null,
  channels: [],
  logs: [],
  logsCurrentPage: 1,
  logsPerPage: 5,
  logsTotal: 0,
  settings: null,
};

const elements = {
  loginView: document.getElementById("login-view"),
  dashboardView: document.getElementById("dashboard-view"),
  loginForm: document.getElementById("login-form"),
  logoutButton: document.getElementById("logout-button"),
  refreshButton: document.getElementById("refresh-button"),
  addChannelButton: document.getElementById("add-channel-button"),
  channelsTableBody: document.querySelector("#channels-table tbody"),
  channelsEmpty: document.getElementById("channels-empty"),
  channelModalElement: document.getElementById("channel-modal"),
  channelModalTitle: document.getElementById("channel-modal-title"),
  channelForm: document.getElementById("channel-form"),
  channelId: document.getElementById("channel-id"),
  channelName: document.getElementById("channel-name"),
  channelYoutubeId: document.getElementById("channel-youtube-id"),
  channelCron: document.getElementById("channel-cron"),
  scheduleFrequency: document.getElementById("schedule-frequency"),
  scheduleTime: document.getElementById("schedule-time"),
  scheduleWeekday: document.getElementById("schedule-weekday"),
  scheduleMonthday: document.getElementById("schedule-monthday"),
  scheduleCustomCron: document.getElementById("schedule-custom-cron"),
  weeklyOptions: document.getElementById("weekly-options"),
  monthlyOptions: document.getElementById("monthly-options"),
  customOptions: document.getElementById("custom-options"),
  cronPreview: document.getElementById("cron-preview"),
  channelVideoLimit: document.getElementById("channel-video-limit"),
  channelDaysBack: document.getElementById("channel-days-back"),
  channelEmails: document.getElementById("channel-emails"),
  channelActive: document.getElementById("channel-active"),
  confirmRemoveModalElement: document.getElementById("confirm-remove-modal"),
  confirmRemoveMessage: document.getElementById("confirm-remove-message"),
  confirmRemoveButton: document.getElementById("confirm-remove-button"),
  logsTableBody: document.querySelector("#logs-table tbody"),
  logsCountBadge: document.getElementById("logs-count-badge"),
  clearLogsButton: document.getElementById("clear-logs-button"),
  logsPaginationInfo: document.getElementById("logs-pagination-info"),
  logsPrevPage: document.getElementById("logs-prev-page"),
  logsCurrentPage: document.getElementById("logs-current-page"),
  logsNextPage: document.getElementById("logs-next-page"),
  settingsButton: document.getElementById("settings-button"),
  settingsModalElement: document.getElementById("settings-modal"),
  settingsForm: document.getElementById("settings-form"),
  settingsWebhook: document.getElementById("settings-webhook"),
  settingsStatusWebhook: document.getElementById("settings-status-webhook"),
  settingsPollingInterval: document.getElementById("settings-polling-interval"),
  settingsPollingTimeout: document.getElementById("settings-polling-timeout"),
  settingsUsername: document.getElementById("settings-username"),
  settingsPassword: document.getElementById("settings-password"),
  confirmClearLogsModalElement: document.getElementById("confirm-clear-logs-modal"),
  confirmClearLogsButton: document.getElementById("confirm-clear-logs-button"),
  confirmCancelJobModalElement: document.getElementById("confirm-cancel-job-modal"),
  confirmCancelJobButton: document.getElementById("confirm-cancel-job-button"),
  languageSelector: document.getElementById("language-selector"),
  loginLanguageSelector: document.getElementById("login-language-selector"),
  toastContainer: document.getElementById("toast-container"),
};

const bootstrapModal = (element) => new window.bootstrap.Modal(element);

const channelModal = bootstrapModal(elements.channelModalElement);
const confirmRemoveModal = bootstrapModal(elements.confirmRemoveModalElement);
const settingsModal = bootstrapModal(elements.settingsModalElement);
const confirmClearLogsModal = bootstrapModal(elements.confirmClearLogsModalElement);
const confirmCancelJobModal = bootstrapModal(elements.confirmCancelJobModalElement);

function setView(view) {
  if (view === "login") {
    elements.loginView.classList.remove("d-none");
    elements.dashboardView.classList.add("d-none");
  } else {
    elements.loginView.classList.add("d-none");
    elements.dashboardView.classList.remove("d-none");
  }
}

async function fetchJSON(url, options = {}) {
  const config = {
    credentials: "include",
    ...options,
  };

  if (config.body && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
    config.headers = {
      "Content-Type": "application/json",
      ...(config.headers ?? {}),
    };
  }

  const response = await fetch(url, config);

  if (response.status === 401) {
    handleUnauthenticated();
    throw new Error(i18n.t('messages.authenticationRequired') || "Authentification requise");
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const payload = await response.json();
      throw new Error(payload.error || i18n.t('messages.serverError') || "Erreur serveur");
    }
    const text = await response.text();
    throw new Error(text || i18n.t('messages.serverError') || "Erreur serveur");
  }

  return isJson ? response.json() : response.text();
}

function handleUnauthenticated() {
  state.session = null;
  state.channels = [];
  state.logs = [];
  state.settings = null;
  setView("login");
}

function showToast(message, variant = "primary") {
  const wrapper = document.createElement("div");
  wrapper.className = "toast align-items-center text-white border-0 show";
  wrapper.setAttribute("role", "alert");
  wrapper.setAttribute("aria-live", "assertive");
  wrapper.setAttribute("aria-atomic", "true");
  wrapper.innerHTML = `
    <div class="d-flex bg-${variant} rounded">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="${i18n.t('actions.close') || 'Fermer'}"></button>
    </div>
  `;
  elements.toastContainer.appendChild(wrapper);
  setTimeout(() => {
    wrapper.classList.remove("show");
    wrapper.classList.add("hide");
    setTimeout(() => wrapper.remove(), 500);
  }, 4000);
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function formatStatus(channel) {
  if (!channel.isActive) {
    return {
      label: i18n.t('status.inactive') || "Inactif",
      color: "danger",
    };
  }

  return {
    label: i18n.t('status.active') || "Actif",
    color: "success",
  };
}

function renderChannels() {
  if (!elements.channelsTableBody) return;
  closeChannelDropdowns();
  elements.channelsTableBody.innerHTML = "";

  if (!state.channels.length) {
    elements.channelsEmpty.classList.remove("d-none");
    return;
  }

  elements.channelsEmpty.classList.add("d-none");

  state.channels
    .slice()
    .sort((a, b) => a.channelName.localeCompare(b.channelName))
    .forEach((channel) => {
      const status = formatStatus(channel);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <div class="fw-semibold">${channel.channelName}</div>
          <div class="text-muted small">${i18n.t('messages.createdOn') || 'Créée le'} ${formatDateTime(channel.createdAt)}</div>
        </td>
        <td><code>${channel.youtubeChannelId}</code></td>
        <td><span class="badge badge-cron">${channel.cronExpression}</span></td>
        <td>
          <div class="small">
            <div><strong>${channel.videoLimit || 5}</strong> ${i18n.t('messages.videos') || 'vidéos'}</div>
            <div><strong>${channel.daysBack || 7}</strong> ${i18n.t('messages.days') || 'jours'}</div>
          </div>
        </td>
        <td>${formatDateTime(channel.lastExecution)}</td>
        <td>${formatDateTime(channel.nextExecution)}</td>
        <td>
          <span class="status-indicator text-${status.color}">
            <span class="dot"></span>${status.label}
          </span>
        </td>
        <td class="text-end table-actions">
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" 
                    data-bs-toggle="dropdown" 
                    data-bs-auto-close="true"
                    aria-expanded="false"
                    title="Actions">
              <span class="material-icons-outlined">more_vert</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <a class="dropdown-item" href="#" data-action="edit" data-id="${channel.id}">
                  <span class="material-icons-outlined me-2">edit</span>
                  ${i18n.t('actions.edit') || 'Modifier'}
                </a>
              </li>
              <li>
                <a class="dropdown-item" href="#" data-action="trigger" data-id="${channel.id}">
                  <span class="material-icons-outlined me-2 text-success">play_arrow</span>
                  ${i18n.t('actions.trigger') || 'Déclencher'}
                </a>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <a class="dropdown-item text-danger" href="#" data-action="remove" data-id="${channel.id}" data-name="${channel.channelName}">
                  <span class="material-icons-outlined me-2">delete</span>
                  ${i18n.t('actions.remove') || 'Supprimer'}
                </a>
              </li>
            </ul>
          </div>
        </td>
      `;
      elements.channelsTableBody.appendChild(row);
    });

  // Initialize tooltips for action buttons
  initializeTooltips();
  setupChannelDropdowns();
}

function initializeTooltips() {
  // Initialize all tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new window.bootstrap.Tooltip(tooltipTriggerEl));
}

const dropdownManager = {
  listenersAttached: false,
  mode: 'unknown',
};

const dropdownPopperOptions = {
  popperConfig: {
    strategy: 'fixed',
    placement: 'bottom-end',
    modifiers: [
      {
        name: 'offset',
        options: { offset: [0, 6] },
      },
      {
        name: 'preventOverflow',
        options: { boundary: document.body, padding: 8 },
      },
      {
        name: 'flip',
        options: { fallbackPlacements: ['bottom-end', 'top-end', 'bottom-start'] },
      },
    ],
  },
};

function setupChannelDropdowns() {
const dropdownButtons = document.querySelectorAll('.table-actions [data-bs-toggle="dropdown"]');
  const bootstrapDropdown = window.bootstrap?.Dropdown;

  dropdownButtons.forEach((button) => {
    if (button.dataset.dropdownEnhanced === 'true') {
      return;
    }

    const menu = button.nextElementSibling;
    if (!(menu instanceof HTMLElement) || !menu.classList.contains('dropdown-menu')) {
      return;
    }

    button.dataset.dropdownEnhanced = 'true';

    if (bootstrapDropdown) {
      dropdownManager.mode = 'bootstrap';
      bootstrapDropdown.getOrCreateInstance(button, dropdownPopperOptions);

      button.addEventListener('show.bs.dropdown', () => {
        setDropdownRowState(button, true);
      });

      button.addEventListener('hide.bs.dropdown', () => {
        setDropdownRowState(button, false);
      });
      return;
    }

    dropdownManager.mode = 'fallback';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleChannelDropdown(button, menu);
    });

    menu.addEventListener('click', () => {
      closeChannelDropdowns();
    });
  });

  if (!dropdownManager.listenersAttached && dropdownManager.mode === 'fallback') {
    dropdownManager.listenersAttached = true;

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.table-actions')) {
        closeChannelDropdowns();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeChannelDropdowns();
      }
    });
  }
}

function toggleChannelDropdown(button, menu) {
  const bootstrapDropdown = window.bootstrap?.Dropdown;
  const wasOpen = menu.classList.contains('show') || button.getAttribute('aria-expanded') === 'true';

  closeChannelDropdowns(button);

  if (bootstrapDropdown) {
    const instance = bootstrapDropdown.getOrCreateInstance(button, dropdownPopperOptions);
    if (wasOpen) {
      instance.hide();
    } else {
      instance.show();
    }
    return;
  }

  if (wasOpen) {
    button.setAttribute('aria-expanded', 'false');
    menu.classList.remove('show');
    menu.style.top = '';
    menu.style.left = '';
    setDropdownRowState(button, false);
    return;
  }

  openFallbackDropdown(button, menu);
  setDropdownRowState(button, true);
}

function openFallbackDropdown(button, menu) {
  menu.classList.add('show');
  menu.style.visibility = 'hidden';
  menu.style.display = 'block';

  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  const top = window.scrollY + buttonRect.bottom + 6;
  const left = window.scrollX + buttonRect.right - menuRect.width;

  menu.style.top = Math.max(0, top) + 'px';
  menu.style.left = Math.max(16, left) + 'px';

  menu.style.visibility = '';
  menu.style.display = '';
  button.setAttribute('aria-expanded', 'true');
}

function closeChannelDropdowns(exceptButton) {
  const bootstrapDropdown = window.bootstrap?.Dropdown;

  document.querySelectorAll('.table-actions [data-bs-toggle="dropdown"]').forEach((button) => {
    if (button === exceptButton) {
      return;
    }

    const menu = button.nextElementSibling;
    if (!(menu instanceof HTMLElement) || !menu.classList.contains('dropdown-menu')) {
      return;
    }

    if (bootstrapDropdown) {
      const instance = bootstrapDropdown.getInstance(button);
      instance?.hide();
    }

    menu.classList.remove('show');
    menu.style.top = '';
    menu.style.left = '';
    button.setAttribute('aria-expanded', 'false');
    setDropdownRowState(button, false);
  });
}

function setDropdownRowState(button, isOpen) {
  const row = button.closest('tr');
  if (!row) {
    return;
  }
  if (isOpen) {
    row.classList.add('dropdown-open-row');
  } else {
    row.classList.remove('dropdown-open-row');
  }
}

function generateCronExpression() {
  const frequency = elements.scheduleFrequency.value;
  const time = elements.scheduleTime.value;
  
  if (!frequency || !time) {
    return '';
  }
  
  const [hours, minutes] = time.split(':');
  
  let cronExpression = '';
  
  switch (frequency) {
    case 'daily':
      cronExpression = `${minutes} ${hours} * * *`;
      break;
    case 'weekly':
      const weekday = elements.scheduleWeekday.value;
      cronExpression = `${minutes} ${hours} * * ${weekday}`;
      break;
    case 'monthly':
      const monthday = elements.scheduleMonthday.value || '1';
      cronExpression = `${minutes} ${hours} ${monthday} * *`;
      break;
    case 'custom':
      cronExpression = elements.scheduleCustomCron.value.trim();
      break;
    default:
      cronExpression = '';
  }
  
  return cronExpression;
}

function updateCronPreview() {
  const cronExpression = generateCronExpression();
  elements.channelCron.value = cronExpression;
  const text = cronExpression ? i18n.t('messages.generatedExpression', {expression: cronExpression}) : i18n.t('messages.generatedExpression', {expression: '-'});
  elements.cronPreview.textContent = text || (cronExpression ? `Expression générée: ${cronExpression}` : 'Expression générée: -');
}

function handleFrequencyChange() {
  const frequency = elements.scheduleFrequency.value;
  
  // Hide all optional sections
  elements.weeklyOptions.style.display = 'none';
  elements.monthlyOptions.style.display = 'none';
  elements.customOptions.style.display = 'none';
  
  // Show relevant section
  switch (frequency) {
    case 'weekly':
      elements.weeklyOptions.style.display = 'block';
      break;
    case 'monthly':
      elements.monthlyOptions.style.display = 'block';
      break;
    case 'custom':
      elements.customOptions.style.display = 'block';
      break;
  }
  
  updateCronPreview();
}

function parseCronExpression(cronExpression) {
  if (!cronExpression) return null;
  
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  
  const [minutes, hours, dayOfMonth, month, dayOfWeek] = parts;
  
  // Daily pattern: * * * (any day, any month, any day of week)
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      frequency: 'daily',
      time: `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
    };
  }
  
  // Weekly pattern: * * number (specific day of week)
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    return {
      frequency: 'weekly',
      time: `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`,
      weekday: dayOfWeek
    };
  }
  
  // Monthly pattern: number * * (specific day of month)
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return {
      frequency: 'monthly',
      time: `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`,
      monthday: dayOfMonth
    };
  }
  
  // Custom pattern
  return {
    frequency: 'custom',
    customCron: cronExpression
  };
}

function renderLogs() {
  if (!elements.logsTableBody) return;

  state.logs.forEach((log) => {
    const exists = elements.logsTableBody.querySelector(`[data-log-id="${log.id}"]`);
    
    if (exists) {
      // Update existing row for real-time status changes
      updateLogRow(exists, log);
      return;
    }

    // Create new row
    const row = document.createElement("tr");
    row.dataset.logId = log.id;
    updateLogRow(row, log);
    elements.logsTableBody.appendChild(row);
  });

  completeLogRendering();
}

function updateLogRow(row, log) {
  // Update row class for background color
  row.className = "";
  row.classList.add(getLogStatusClass(log.status));

  // Check if job can be cancelled (has jobId and is not finished)
  const canCancel = log.jobId && (log.status === 'pending' || log.status === 'started' || log.status === 'running');

  // Update row content
  row.innerHTML = `
    <td>${resolveChannelName(log.channelId)}</td>
    <td>
      <span class="badge ${getLogBadgeClass(log.status)}">
        ${getLogStatusText(log.status)}
      </span>
    </td>
    <td>${formatDateTime(log.startedAt)}</td>
    <td>${log.finishedAt ? formatDateTime(log.finishedAt) : '-'}</td>
    <td>${log.retries}</td>
    <td class="text-break">${log.message}</td>
    <td>
      ${canCancel ? `
        <div class="dropdown">
          <button
            class="btn btn-outline-secondary btn-sm"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            style="min-width: 32px;">
            <span class="material-icons-outlined">more_horiz</span>
          </button>
          <ul class="dropdown-menu">
            <li>
              <button
                class="dropdown-item text-danger"
                onclick="showCancelJobModal('${log.jobId}', '${log.id}')"
                data-i18n="actions.cancel">
                Annuler
              </button>
            </li>
          </ul>
        </div>
      ` : ''}
    </td>
  `;
}

function getLogStatusClass(status) {
  switch (status) {
    case 'success': return 'success';
    case 'error': return 'error';
    case 'pending': return 'pending';
    case 'started': return 'started';
    case 'running': return 'running';
    case 'cancelled': return 'cancelled';
    default: return 'error';
  }
}

function getLogBadgeClass(status) {
  switch (status) {
    case 'success': return 'text-bg-success';
    case 'error': return 'text-bg-danger';
    case 'pending': return 'text-bg-warning';
    case 'started': return 'text-bg-info';
    case 'running': return 'text-bg-primary';
    case 'cancelled': return 'text-bg-secondary';
    default: return 'text-bg-secondary';
  }
}

function getLogStatusText(status) {
  switch (status) {
    case 'success': return i18n.t('logs.status.success') || 'Succès';
    case 'error': return i18n.t('logs.status.error') || 'Erreur';
    case 'pending': return i18n.t('logs.status.pending') || 'En cours';
    case 'started': return i18n.t('logs.status.started') || 'Démarré';
    case 'running': return i18n.t('logs.status.running') || 'En cours';
    case 'cancelled': return i18n.t('logs.status.cancelled') || 'Annulé';
    default: return i18n.t('status.unknown') || 'Inconnu';
  }
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

let currentJobToCancel = { jobId: null, logId: null };

function showCancelJobModal(jobId, logId) {
  currentJobToCancel = { jobId, logId };
  confirmCancelJobModal.show();
}

async function cancelJob() {
  const { jobId, logId } = currentJobToCancel;
  if (!jobId || !logId) return;

  try {
    const response = await fetchJSON(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    if (response.success) {
      showToast(i18n.t('messages.jobCancelled') || 'Exécution annulée avec succès', 'success');
      // Refresh logs to show updated status
      await loadLogs();
      // Hide modal
      confirmCancelJobModal.hide();
    } else {
      showToast(response.message || 'Erreur lors de l\'annulation', 'danger');
    }
  } catch (error) {
    showToast(error.message || 'Erreur lors de l\'annulation', 'danger');
  }

  // Reset current job to cancel
  currentJobToCancel = { jobId: null, logId: null };
}

function validateEmailsList(emailsText) {
  if (!emailsText || !emailsText.trim()) {
    return { valid: false, error: i18n.t('messages.validEmailsRequired') || "Au moins une adresse email est requise" };
  }

  const emails = emailsText.split(',').map(email => email.trim()).filter(email => email);
  
  if (emails.length === 0) {
    return { valid: false, error: i18n.t('messages.validEmailsRequired') || "Au moins une adresse email est requise" };
  }

  for (const email of emails) {
    if (!validateEmail(email)) {
      return { valid: false, error: i18n.t('messages.invalidEmail', {email}) || `L'adresse email "${email}" n'est pas valide` };
    }
  }

  // Check for duplicates
  const uniqueEmails = new Set(emails);
  if (uniqueEmails.size !== emails.length) {
    return { valid: false, error: i18n.t('messages.duplicateEmails') || "Des adresses emails sont dupliquées" };
  }

  return { valid: true, emails: emails };
}

function validateEmailsInput() {
  const emailsText = elements.channelEmails.value.trim();
  const formText = elements.channelEmails.parentElement.querySelector('.form-text');
  
  // Remove existing validation classes
  elements.channelEmails.classList.remove('is-valid', 'is-invalid');
  
  if (!emailsText) {
    // Show default help text if empty
    formText.textContent = i18n.t('messages.defaultEmailsHelp') || "Séparez les adresses emails par des virgules. Ces adresses recevront les notifications du workflow N8N.";
    formText.className = "form-text";
    return;
  }
  
  const validation = validateEmailsList(emailsText);
  
  if (validation.valid) {
    elements.channelEmails.classList.add('is-valid');
    formText.textContent = i18n.t('messages.emailsValid', {count: validation.emails.length}) || `✓ ${validation.emails.length} adresse(s) email valide(s)`;
    formText.className = "form-text text-success";
  } else {
    elements.channelEmails.classList.add('is-invalid');
    formText.textContent = validation.error;
    formText.className = "form-text text-danger";
  }
}

function completeLogRendering() {
  elements.logsCountBadge.innerHTML = i18n.t('messages.executionsCount', {count: state.logsTotal}) || `${state.logsTotal} exécutions`;
}

function updatePagination() {
  const totalPages = Math.ceil(state.logsTotal / state.logsPerPage);
  const currentPage = state.logsCurrentPage;
  
  // Update pagination info
  elements.logsPaginationInfo.textContent = i18n.t('messages.pageInfo', {current: currentPage, total: totalPages}) || `Page ${currentPage} sur ${totalPages}`;
  
  // Update current page number
  elements.logsCurrentPage.querySelector('.page-link').textContent = currentPage;
  
  // Update previous button state
  if (currentPage <= 1) {
    elements.logsPrevPage.classList.add('disabled');
  } else {
    elements.logsPrevPage.classList.remove('disabled');
  }
  
  // Update next button state
  if (currentPage >= totalPages) {
    elements.logsNextPage.classList.add('disabled');
  } else {
    elements.logsNextPage.classList.remove('disabled');
  }
  
  // Hide pagination if no logs
  const paginationContainer = elements.logsPaginationInfo.closest('.mt-4');
  if (state.logsTotal === 0) {
    paginationContainer.style.display = 'none';
  } else {
    paginationContainer.style.display = 'block';
  }
}

function resolveChannelName(channelId) {
  const channel = state.channels.find((item) => item.id === channelId);
  return channel ? channel.channelName : channelId;
}

function updateDashboardMetrics() {
  const channelsValueEl = document.getElementById("metric-channels");
  const nextRunEl = document.getElementById("metric-next-run");
  const nextRunChannelEl = document.getElementById("metric-next-channel");
  const activeJobsEl = document.getElementById("metric-active-jobs");

  if (channelsValueEl) {
    const activeCount = state.channels.filter((channel) => channel.isActive).length;
    const totalCount = state.channels.length;
    channelsValueEl.textContent = totalCount > 0 ? `${activeCount}/${totalCount}` : "0";
    channelsValueEl.setAttribute("title", `${activeCount} / ${totalCount}`);
  }

  if (nextRunEl) {
    const upcomingChannels = state.channels
      .filter((channel) => Boolean(channel.nextExecution))
      .map((channel) => ({
        channel,
        date: new Date(channel.nextExecution),
      }))
      .filter((item) => !Number.isNaN(item.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (upcomingChannels.length > 0) {
      const nextItem = upcomingChannels[0];
      nextRunEl.textContent = formatDateTime(nextItem.channel.nextExecution);
      if (nextRunChannelEl) {
        nextRunChannelEl.textContent = nextItem.channel.channelName;
      }
    } else {
      nextRunEl.textContent = "—";
      if (nextRunChannelEl) {
        nextRunChannelEl.textContent = "—";
      }
    }
  } else if (nextRunChannelEl) {
    nextRunChannelEl.textContent = "—";
  }

  if (activeJobsEl) {
    const activeJobs = state.settings?.activeJobsCount ?? 0;
    activeJobsEl.textContent = activeJobs.toString();
  }
}

async function loadSession() {
  const session = await fetchJSON("/api/session");
  state.session = session;
  if (session.authenticated) {
    setView("dashboard");
  } else {
    setView("login");
  }
}

async function loadSettings() {
  state.settings = await fetchJSON("/api/settings");
  if (state.settings) {
    elements.settingsWebhook.value = state.settings.n8nWebhookUrl ?? "";
    elements.settingsStatusWebhook.value = state.settings.n8nStatusWebhookUrl ?? "";
    elements.settingsPollingInterval.value = state.settings.pollingIntervalMs ?? "";
    elements.settingsPollingTimeout.value = state.settings.pollingTimeoutMs ?? "";
    elements.settingsUsername.value = state.settings.adminUsername ?? "";
    elements.settingsPassword.value = "";
  }

  updateDashboardMetrics();
}

async function loadChannels() {
  state.channels = await fetchJSON("/api/channels");
  renderChannels();
  updateDashboardMetrics();
}

async function loadLogs(page = state.logsCurrentPage) {
  const offset = (page - 1) * state.logsPerPage;
  const response = await fetchJSON(`/api/logs?offset=${offset}&limit=${state.logsPerPage}`);
  
  state.logsTotal = response.total;
  state.logsCurrentPage = page;
  state.logs = [...response.items];
  
  if (elements.logsTableBody) {
    elements.logsTableBody.innerHTML = "";
  }

  renderLogs();
  updatePagination();
  updateDashboardMetrics();
  await refreshActiveJobsCount();
}

function resetChannelForm() {
  elements.channelForm.reset();
  elements.channelId.value = "";
  elements.channelActive.checked = true;
  elements.channelVideoLimit.value = "5";
  elements.channelDaysBack.value = "7";
  elements.channelEmails.value = "";
  
  // Reset schedule form
  elements.scheduleFrequency.value = "";
  elements.scheduleTime.value = "09:00";
  elements.scheduleWeekday.value = "1";
  elements.scheduleMonthday.value = "1";
  elements.scheduleCustomCron.value = "";
  
  // Hide all optional sections
  elements.weeklyOptions.style.display = 'none';
  elements.monthlyOptions.style.display = 'none';
  elements.customOptions.style.display = 'none';
  
  elements.channelModalTitle.textContent = i18n.t('messages.newChannel') || "Nouvelle chaîne";
  updateCronPreview();
}

function fillChannelForm(channel) {
  elements.channelId.value = channel.id;
  elements.channelName.value = channel.channelName;
  elements.channelYoutubeId.value = channel.youtubeChannelId;
  elements.channelVideoLimit.value = channel.videoLimit || 5;
  elements.channelDaysBack.value = channel.daysBack || 7;
  elements.channelEmails.value = (channel.emails || []).join(', ');
  elements.channelActive.checked = Boolean(channel.isActive);
  
  // Parse and fill schedule form
  const parsedCron = parseCronExpression(channel.cronExpression);
  if (parsedCron) {
    elements.scheduleFrequency.value = parsedCron.frequency;
    
    if (parsedCron.time) {
      elements.scheduleTime.value = parsedCron.time;
    }
    
    if (parsedCron.weekday) {
      elements.scheduleWeekday.value = parsedCron.weekday;
    }
    
    if (parsedCron.monthday) {
      elements.scheduleMonthday.value = parsedCron.monthday;
    }
    
    if (parsedCron.customCron) {
      elements.scheduleCustomCron.value = parsedCron.customCron;
    }
    
    handleFrequencyChange();
  }
  
  elements.channelModalTitle.textContent = i18n.t('messages.modifyChannel', {channelName: channel.channelName}) || `Modifier · ${channel.channelName}`;
}

function registerEventListeners() {
  elements.loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.loginForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      await fetchJSON("/api/login", {
        method: "POST",
        body: payload,
      });
      showToast(i18n.t('messages.loginSuccessful') || "Connexion réussie", "success");
      await loadSession();
      if (state.session?.authenticated) {
        await Promise.all([loadSettings(), loadChannels(), loadLogs()]);
      }
    } catch (error) {
      showToast(error.message, "danger");
    }
  });

  elements.logoutButton?.addEventListener("click", async () => {
    try {
      await fetchJSON("/api/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout error", error);
    } finally {
      handleUnauthenticated();
    }
  });

  elements.refreshButton?.addEventListener("click", async () => {
    try {
      await Promise.all([loadChannels(), loadLogs(), loadSettings()]);
      showToast(i18n.t('messages.dataRefreshed') || "Données rafraîchies", "primary");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });

  elements.addChannelButton?.addEventListener("click", () => {
    resetChannelForm();
    channelModal.show();
  });

  elements.settingsButton?.addEventListener("click", () => {
    settingsModal.show();
  });

  // Language selectors
  elements.languageSelector?.addEventListener("change", async (event) => {
    await i18n.setLanguage(event.target.value);
  });

  elements.loginLanguageSelector?.addEventListener("change", async (event) => {
    await i18n.setLanguage(event.target.value);
  });

  // Schedule form event listeners
  elements.scheduleFrequency?.addEventListener("change", handleFrequencyChange);
  elements.scheduleTime?.addEventListener("change", updateCronPreview);
  elements.scheduleWeekday?.addEventListener("change", updateCronPreview);
  elements.scheduleMonthday?.addEventListener("input", updateCronPreview);
  elements.scheduleCustomCron?.addEventListener("input", updateCronPreview);
  
  // Email validation on input
  elements.channelEmails?.addEventListener("input", validateEmailsInput);

  elements.channelsTableBody?.addEventListener("click", async (event) => {
    // Handle both button clicks and dropdown item clicks
    const actionElement = event.target.closest("button[data-action], a[data-action]");
    if (!actionElement) return;

    // Prevent default behavior for anchor links
    if (actionElement.tagName === "A") {
      event.preventDefault();
    }

    const { action, id } = actionElement.dataset;
    const channel = state.channels.find((item) => item.id === id);

    if (action === "edit" && channel) {
      fillChannelForm(channel);
      channelModal.show();
      return;
    }

    if (action === "trigger" && channel) {
      try {
        await fetchJSON(`/api/channels/${id}/trigger`, { method: "POST" });
        showToast(i18n.t('messages.triggerRequested', {channelName: channel.channelName}) || `Déclenchement demandé pour ${channel.channelName}`, "success");
        await loadLogs();
      } catch (error) {
        showToast(error.message, "danger");
      }
      return;
    }

    if (action === "remove" && channel) {
      elements.confirmRemoveMessage.textContent = i18n.t('messages.confirmRemoveChannel', {channelName: channel.channelName}) || `Supprimer « ${channel.channelName} » ?`;
      elements.confirmRemoveButton.dataset.id = id;
      confirmRemoveModal.show();
    }
  });

  elements.confirmRemoveButton?.addEventListener("click", async (event) => {
    const { id } = event.target.dataset;
    if (!id) return;

    try {
      await fetchJSON(`/api/channels/${id}`, { method: "DELETE" });
      showToast(i18n.t('messages.channelDeleted') || "Chaîne supprimée", "success");
      confirmRemoveModal.hide();
      await loadChannels();
    } catch (error) {
      showToast(error.message, "danger");
    }
  });

  elements.channelForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    
    // Generate final cron expression before submission
    updateCronPreview();
    
    const id = elements.channelId.value;
    const cronExpression = elements.channelCron.value.trim();
    
    if (!cronExpression) {
      showToast(i18n.t('messages.validScheduleRequired') || "Veuillez configurer une planification valide", "danger");
      return;
    }
    
    // Validate emails from textarea
    const emailsText = elements.channelEmails.value.trim();
    const emailValidation = validateEmailsList(emailsText);
    
    if (!emailValidation.valid) {
      showToast(emailValidation.error, "danger");
      return;
    }
    
    const emails = emailValidation.emails;
    
    const payload = {
      channelName: elements.channelName.value.trim(),
      youtubeChannelId: elements.channelYoutubeId.value.trim(),
      cronExpression: cronExpression,
      isActive: elements.channelActive.checked,
      videoLimit: parseInt(elements.channelVideoLimit.value, 10) || 5,
      daysBack: parseInt(elements.channelDaysBack.value, 10) || 7,
      emails: emails,
    };

    try {
      if (id) {
        await fetchJSON(`/api/channels/${id}`, {
          method: "PUT",
          body: payload,
        });
        showToast(i18n.t('messages.channelUpdated') || "Chaîne mise à jour", "success");
      } else {
        await fetchJSON("/api/channels", {
          method: "POST",
          body: payload,
        });
        showToast(i18n.t('messages.channelCreated') || "Chaîne créée", "success");
      }
      channelModal.hide();
      await loadChannels();
    } catch (error) {
      showToast(error.message, "danger");
    }
  });

  // Pagination controls
  elements.logsPrevPage?.addEventListener("click", async () => {
    if (state.logsCurrentPage > 1) {
      try {
        await loadLogs(state.logsCurrentPage - 1);
      } catch (error) {
        showToast(error.message, "danger");
      }
    }
  });

  elements.logsNextPage?.addEventListener("click", async () => {
    const totalPages = Math.ceil(state.logsTotal / state.logsPerPage);
    if (state.logsCurrentPage < totalPages) {
      try {
        await loadLogs(state.logsCurrentPage + 1);
      } catch (error) {
        showToast(error.message, "danger");
      }
    }
  });

  // Clear all logs button
  elements.clearLogsButton?.addEventListener("click", () => {
    confirmClearLogsModal.show();
  });

  // Confirm clear logs button
  elements.confirmClearLogsButton?.addEventListener("click", async () => {
    try {
      await fetchJSON("/api/logs", { method: "DELETE" });
      state.logsCurrentPage = 1;
      await loadLogs();
      confirmClearLogsModal.hide();
      showToast(i18n.t('messages.allLogsCleared') || "Toutes les exécutions ont été supprimées", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });

  // Confirm cancel job button
  elements.confirmCancelJobButton?.addEventListener("click", async () => {
    await cancelJob();
  });

  elements.settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      n8nWebhookUrl: elements.settingsWebhook.value.trim(),
      adminUsername: elements.settingsUsername.value.trim(),
    };

    if (elements.settingsPassword.value) {
      payload.adminPassword = elements.settingsPassword.value;
    }

    try {
      const settings = await fetchJSON("/api/settings", {
        method: "PUT",
        body: payload,
      });
      state.settings = settings;
      elements.settingsPassword.value = "";
      settingsModal.hide();
      showToast(i18n.t('messages.settingsSaved') || "Paramètres enregistrés", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

async function bootstrap() {
  try {
    await loadSession();
    if (state.session?.authenticated) {
      await Promise.all([loadSettings(), loadChannels(), loadLogs()]);
    }
    // Initialize tooltips on page load
    initializeTooltips();

    // Auto-refresh logs every 5 seconds to see real-time status updates
    setInterval(async () => {
      if (state.session.authenticated) {
        try {
          await loadLogs();
        } catch (error) {
          // Silently ignore errors during auto-refresh
        }
      }
    }, 5000);
  } catch (error) {
    console.error("Bootstrap error", error);
  }
}

async function refreshActiveJobsCount() {
  try {
    const settings = await fetchJSON("/api/settings");
    if (state.settings) {
      state.settings.activeJobsCount = settings.activeJobsCount;
    } else {
      state.settings = settings;
    }
    updateDashboardMetrics();
  } catch (error) {
    console.warn('Failed to refresh active jobs count', error);
  }
}

function updateLanguageSelector() {
  const selector = document.getElementById('language-selector');
  if (selector) {
    selector.value = i18n.currentLang;
  }
  
  const loginSelector = document.getElementById('login-language-selector');
  if (loginSelector) {
    loginSelector.value = i18n.currentLang;
  }
}

async function initializeApp() {
  await i18n.init();
  registerEventListeners();
  await bootstrap();
}

initializeApp();
