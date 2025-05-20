const CLASSES_TO_REMOVE = [
  "layout-item_styles__zc08zp30 default-ltr-cache-7vbe6a ermvlvv0",
  "default-ltr-cache-1sfbp89 e1qcljkj0",
  "css-1nym653 modal-enter-done",
  "nf-modal interstitial-full-screen",
];

// State object that contains all controller elements and state
let state = {
  progressionIntervalId: null,
  controllerElement: null,
  buttonPlayPause: null,
  buttonFullScreen: null,
  progressionBar: null,
  screenTime: null,
  videoElement: null,
  volumeSlider: null,
  lastScreenTime: -1,
  lastTotalTime: -1,
  isControllerAdded: false,
  mutationTimeout: null,
  controllerTimerId: null,
  isControllerVisible: true,
  controllerHideTimer: null,
  videoOverlay: null,
  keyboardListener: null,
  messageOverlay: null,
  messageTimer: null,
  seekAmount: 10, // seconds to seek with arrow keys
  backButton: null, // New property to track the back button element

  // Subtitle-related state
  subtitleEnabled: true,
  bilingualEnabled: false,
  primarySubtitleTrack: null,
  secondarySubtitleTrack: null,
  availableSubtitleTracks: [],
  substitleLanguage: 0,
  subtitleObserver: null,
  subtitleContainer: null,
  subtitleSettingsOpen: false,
  subtitleSettingsPanel: null,
  primaryLanguage: "en", // Default primary language
  secondaryLanguage: "es", // Default secondary language
  subtitlePosition: "bottom", // Can be "bottom" or "top"
  subtitleSize: "medium", // Can be "small", "medium", "large"
  primaryColor: "white",
  secondaryColor: "#FFD700", // Gold color for secondary language
  subtitleBackgroundOpacity: 0.5,

  //Audio
  availableAudioTracks: [],
  audioLanguage: 0,

  // Episodes list state
  episodesListOpen: false,
};

// Constants
const CONTROLLER_ID = "mon-controleur-netflix";
const NETFLIX_WATCH_REGEX = /^https:\/\/www\.netflix\.com\/watch\/\d+/;
const CONTROLLER_INIT_DELAY = 1500; // Reduced from 3000ms
const CONTROLLER_HIDE_DELAY = 3000; // Hide controller after 3 seconds of inactivity
const SUBTITLE_SETTINGS_ID = "netflix-subtitle-settings";

// script injecter to seek using progress bar
function injectScript(fileName) {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(fileName);
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Inject the script
injectScript("netflix-seeker.js");
injectScript("netflix-audioChange.js");
injectScript("netflix-substitleChange.js");

/**
 * Check if the current URL is a Netflix watch URL
 * @returns {boolean} True if on Netflix watch page
 */
function isOnNetflixWatch() {
  return NETFLIX_WATCH_REGEX.test(window.location.href);
}

/**
 * Format time in seconds to MM:SS format
 * @param {number} timeInSeconds - Time in seconds
 * @returns {string} Formatted time string
 */
function timeFormat(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Format duration to MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Change Audio
 */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "FROM_AUDIOCHANGE_SCRIPT") {
    if (typeof state === "object" && state !== null) {
      state.availableAudioTracks = Array.isArray(event.data.audioTracks)
        ? event.data.audioTracks
        : [];

      console.log(
        "Available subtitle tracks set to:",
        state.availableAudioTracks
      );
    } else {
      console.warn("state is not defined or is invalid.");
    }
  }
});

/**
 * Change Substitle
 */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "FROM_SUBSTITLECHANGE_SCRIPT") {
    if (typeof state === "object" && state !== null) {
      state.availableSubtitleTracks = Array.isArray(event.data.substitleTracks)
        ? event.data.substitleTracks
        : [];

      console.log(
        "Available subtitle tracks set to:",
        state.availableSubtitleTracks
      );
    } else {
      console.warn("state is not defined or is invalid.");
    }
  }
});

/**
 * Show episodes list panel
 */
async function showEpisodesList() {
  const curEpisodeId = getIdFromUrl();
  if (!curEpisodeId) return;

  try {
    const response = await fetch(
      `https://www.netflix.com/nq/website/memberapi/release/metadata?movieid=${curEpisodeId}`,
      {
        credentials: "include",
      }
    );
    const data = await response.json();

    // Remove existing panel if any
    const existingPanel = document.getElementById("netflix-episodes-list");
    if (existingPanel) existingPanel.remove();

    // Create new panel
    const panel = document.createElement("div");
    panel.id = "netflix-episodes-list";
    panel.className = "visible";

    // Order seasons by sequence number
    const seasons = data.video.seasons.sort((a, b) => a.seq - b.seq);

    panel.innerHTML = `
            <h3>${data.video.title}</h3>
            ${seasons
              .map(
                (season) => `
                <div class="season-container">
                    <div class="season-header">Season ${season.seq}</div>
                    ${season.episodes
                      .map(
                        (episode) => `
                        <div class="episode-item ${
                          episode.id.toString() === curEpisodeId
                            ? "current"
                            : ""
                        }" 
                             data-episode-id="${episode.id}">
                            <span class="episode-number">E${episode.seq}</span>
                            <span class="episode-title">${episode.title}</span>
                            <span class="episode-duration">${formatDuration(
                              episode.runtime
                            )}</span>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            `
              )
              .join("")}
        `;

    document.body.appendChild(panel);
    state.episodesListOpen = true;

    // Add click handlers
    panel.querySelectorAll(".episode-item").forEach((item) => {
      item.addEventListener("click", () => {
        const episodeId = item.getAttribute("data-episode-id");
        if (episodeId) {
          window.location.href = `https://www.netflix.com/watch/${episodeId}`;
        }
      });
    });

    // Close panel when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !panel.contains(e.target) &&
        !e.target.closest("#netflix-episodes-button")
      ) {
        panel.remove();
        state.episodesListOpen = false;
      }
    });
  } catch (error) {
    console.error("Error fetching episodes:", error);
  }
}

/**
 * Update the progress bar and time display
 */
function updateProgression() {
  const { videoElement, progressionBar, screenTime } = state;

  if (!videoElement || !progressionBar || !screenTime) return;

  if (videoElement.duration) {
    const percentage = (videoElement.currentTime / videoElement.duration) * 100;
    progressionBar.style.width = `${percentage}%`;

    const currentTime = Math.floor(videoElement.currentTime);
    const totalTime = Math.floor(videoElement.duration);

    if (
      state.lastScreenTime !== currentTime ||
      state.lastTotalTime !== totalTime
    ) {
      state.lastScreenTime = currentTime;
      state.lastTotalTime = totalTime;
      screenTime.textContent = `${timeFormat(currentTime)} / ${timeFormat(
        totalTime
      )}`;
    }
  }
}

/**
 * Toggle fullscreen mode
 */
function toggleFullScreen() {
  const fullscreenElement = document.documentElement; // Cibler tout le site

  if (!document.fullscreenElement) {
    if (fullscreenElement.requestFullscreen) {
      fullscreenElement.requestFullscreen();
    } else if (fullscreenElement.mozRequestFullScreen) {
      fullscreenElement.mozRequestFullScreen();
    } else if (fullscreenElement.webkitRequestFullscreen) {
      fullscreenElement.webkitRequestFullscreen();
    } else if (fullscreenElement.msRequestFullscreen) {
      fullscreenElement.msRequestFullscreen();
    }

    if (state.buttonFullScreen) {
      state.buttonFullScreen.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" fill="white"/></svg>';
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }

    if (state.buttonFullScreen) {
      state.buttonFullScreen.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.59 5.59L18 7L12 13L7.41 18.41L6 17L12 11L18 17L16.59 18.41Z" fill="white"/></svg>';
    }
  }
}

/**
 * Create and add styles if not already present
 */
function createStylesIfNeeded() {
  if (!document.getElementById("netflix-controller-styles")) {
    // Create a link element for the external CSS
    const link = document.createElement("link");
    link.id = "netflix-controller-styles";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("netflix-controller.css");
    document.head.appendChild(link);
  }
}

/**
 * Clean up controller elements and reset state
 */
function cleanController() {
  if (state.progressionIntervalId) {
    cancelAnimationFrame(state.progressionIntervalId);
    state.progressionIntervalId = null;
  }

  if (state.controllerHideTimer) {
    clearTimeout(state.controllerHideTimer);
    state.controllerHideTimer = null;
  }

  if (state.subtitleObserver) {
    state.subtitleObserver.disconnect();
    state.subtitleObserver = null;
  }

  if (state.controllerElement) {
    state.controllerElement.remove();
  }

  if (state.videoOverlay) {
    state.videoOverlay.remove();
  }

  // Also clean up the video area overlay
  const videoAreaOverlay = document.getElementById(
    "netflix-video-area-overlay"
  );
  if (videoAreaOverlay) {
    videoAreaOverlay.remove();
  }

  if (state.messageOverlay) {
    state.messageOverlay.remove();
  }

  if (state.subtitleSettingsPanel) {
    state.subtitleSettingsPanel.remove();
  }

  // Remove the back button
  if (state.backButton) {
    state.backButton.remove();
  }

  // Remove keyboard event listener if exists
  if (state.keyboardListener) {
    document.removeEventListener("keydown", state.keyboardListener);
    state.keyboardListener = null;
  }

  state = {
    ...state,
    controllerElement: null,
    buttonPlayPause: null,
    buttonFullScreen: null,
    progressionBar: null,
    screenTime: null,
    videoElement: null,
    volumeSlider: null,
    videoOverlay: null,
    keyboardListener: null,
    messageOverlay: null,
    messageTimer: null,
    isControllerAdded: false,
    isControllerVisible: true,
    seekAmount: 10,

    // Keep subtitle preferences, reset other subtitle state
    subtitleEnabled: state.subtitleEnabled,
    bilingualEnabled: state.bilingualEnabled,
    primaryLanguage: state.primaryLanguage,
    secondaryLanguage: state.secondaryLanguage,
    subtitlePosition: state.subtitlePosition,
    subtitleSize: state.subtitleSize,
    primaryColor: state.primaryColor,
    secondaryColor: state.secondaryColor,
    subtitleBackgroundOpacity: state.subtitleBackgroundOpacity,

    primarySubtitleTrack: null,
    secondarySubtitleTrack: null,
    subtitleObserver: null,
    subtitleContainer: null,
    subtitleSettingsOpen: false,
    subtitleSettingsPanel: null,
  };
}

/**
 * Show the controller and set a timer to hide it
 */
function showController() {
  if (!state.controllerElement) return;

  state.controllerElement.classList.remove("hidden");
  state.backButton.style.opacity = "1";
  state.isControllerVisible = true;

  // Show cursor when controls are visible
  const videoAreaOverlay = document.getElementById(
    "netflix-video-area-overlay"
  );
  if (videoAreaOverlay) {
    videoAreaOverlay.style.cursor = "pointer";
  }

  if (state.controllerHideTimer) {
    clearTimeout(state.controllerHideTimer);
  }

  state.controllerHideTimer = setTimeout(() => {
    if (
      state.controllerElement &&
      !state.videoElement.paused &&
      !state.subtitleSettingsOpen
    ) {
      state.controllerElement.classList.add("hidden");
      state.backButton.style.opacity = "0";
      state.isControllerVisible = false;

      // Hide cursor when controls are hidden
      if (videoAreaOverlay) {
        videoAreaOverlay.style.cursor = "none";
      }
    }
  }, CONTROLLER_HIDE_DELAY);
}

/**
 * Show a message overlay with the given text
 * @param {string} message - Message to display
 * @param {number} duration - Duration to show message in milliseconds
 */
function showMessage(message, duration = 1500) {
  if (state.messageTimer) {
    clearTimeout(state.messageTimer);
    state.messageTimer = null;
  }

  if (!state.messageOverlay) {
    state.messageOverlay = document.createElement("div");
    state.messageOverlay.id = "netflix-message-overlay";
    document.body.appendChild(state.messageOverlay);
  }

  state.messageOverlay.textContent = message;
  state.messageOverlay.style.opacity = "1";

  state.messageTimer = setTimeout(() => {
    state.messageOverlay.style.opacity = "0";
  }, duration);
}

/**
 * Create subtitle settings panel
 * @returns {HTMLElement} The settings panel element
 */
function createSubtitleSettings() {
  // Create settings panel
  const panel = document.createElement("div");
  panel.id = SUBTITLE_SETTINGS_ID;
  panel.className = state.subtitleSettingsOpen ? "visible" : "";

  // Create settings content
  panel.innerHTML = `
        <h3>Language Settings</h3>
        
        <div class="subtitle-settings-row">
            <span class="subtitle-settings-label">Subtitles</span>
            <div class="subtitle-settings-control">
                <label class="subtitle-toggle-switch">
                    <input type="checkbox" id="subtitle-toggle-checkbox" ${
                      state.subtitleEnabled ? "checked" : ""
                    }>
                    <span class="subtitle-toggle-slider"></span>
                </label>
            </div>
        </div>
        
     
        
        <div class="subtitle-settings-row">
            <span class="subtitle-settings-label">Audio Language</span>
            <div class="subtitle-settings-control">
                <select id="audio-language-select" class="subtitle-select">
                    ${generateAudioLanguageOptions(state.audioLanguage)}
                </select>
            </div>
        </div>
        
        <div class="subtitle-settings-row">
            <span class="subtitle-settings-label">Subtitles Language</span>
            <div class="subtitle-settings-control">
                <select id="subtitle-language-select" class="subtitle-select">
                    ${generateSubtitleLanguageOptions(state.substitleLanguage)}
                </select>
            </div>
        </div>
    `;

  document.body.appendChild(panel);

  // Add event listeners for settings controls
  panel
    .querySelector("#subtitle-toggle-checkbox")
    .addEventListener("change", (e) => {
      state.subtitleEnabled = e.target.checked;
    });

  panel
    .querySelector("#audio-language-select")
    .addEventListener("change", (e) => {
      state.audioLanguage = e.target.value;
      console.log("e", e.target.value);
      window.dispatchEvent(
        new CustomEvent("netflixAudioChange", { detail: e.target.value })
      );
      setTimeout(() => {
        doYourJob();
        showMessage(
          `Audio changed to ${
            state.availableAudioTracks[e.target.value].displayName
          } `,
          2000
        );
      }, 500);
    });

  panel
    .querySelector("#subtitle-language-select")
    .addEventListener("change", (e) => {
      state.substitleLanguage = e.target.value;
      window.dispatchEvent(
        new CustomEvent("netflixSubtitleChange", { detail: e.target.value })
      );
      console.log(
        "izan",
        state.availableSubtitleTracks[e.target.value].displayName
      );
      setTimeout(() => {
        doYourJob();
        showMessage(
          `Subtitle changed to ${
            state.availableSubtitleTracks[e.target.value].displayName
          } `,
          2000
        );
      }, 500);
    });
  return panel;
}

/**
 * Generate HTML options for language dropdown
 * @param {string} selectedLang - Currently selected language code
 * @returns {string} HTML string of options
 */
function generateAudioLanguageOptions(selectedLang) {
  let optionsHTML = "";
  if (state.availableAudioTracks.length > 0) {
    state.availableAudioTracks.forEach((track, index) => {
      const isSelected = track.key === selectedLang ? "selected" : "";
      optionsHTML += `<option value="${index}" ${isSelected}>${track.displayName}</option>`;
    });
  }
  return optionsHTML;
}
function generateSubtitleLanguageOptions(selectedLang) {
  let optionsHTML = "";

  if (state.availableSubtitleTracks.length > 0) {
    state.availableSubtitleTracks.forEach((track, index) => {
      const isSelected = track.key === selectedLang ? "selected" : "";
      optionsHTML += `<option value="${index}" ${isSelected}>${track.displayName}</option>`;
    });
  }
  return optionsHTML;
}

/**
 * Toggle subtitle settings panel visibility
 */
function toggleSubtitleSettings() {
  state.subtitleSettingsOpen = !state.subtitleSettingsOpen;

  if (!state.subtitleSettingsPanel) {
    state.subtitleSettingsPanel = createSubtitleSettings();
  }

  if (state.subtitleSettingsOpen) {
    state.subtitleSettingsPanel.classList.add("visible");

    // Don't hide controller when settings are open
    if (state.controllerHideTimer) {
      clearTimeout(state.controllerHideTimer);
      state.controllerHideTimer = null;
    }
  } else {
    state.subtitleSettingsPanel.classList.remove("visible");
    showController(); // Restart controller hide timer
  }
}

/**
 * Set up keyboard shortcuts globally for the entire website
 */
function setupKeyboardShortcuts() {
  // Remove any existing listeners to avoid duplicates
  if (state.keyboardListener) {
    document.removeEventListener("keydown", state.keyboardListener);
  }

  // Create the keyboard listener function
  state.keyboardListener = function (e) {
    // Only handle events if we're on a Netflix watch page
    if (!isOnNetflixWatch()) return;

    // Don't capture keyboard events if user is typing in an input field
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    // Always ensure video element is current
    const videoElement = document.querySelector("video");
    if (!videoElement) return;

    // Always show controller when key is pressed if the controller exists
    if (state.controllerElement) {
      showController();
    }

    // Handle all other keys normally
    switch (e.key) {
      case " ": // Spacebar - toggle play/pause
        e.preventDefault(); // Prevent page scrolling

        if (videoElement.paused) {
          videoElement.play();
          if (state.buttonPlayPause) {
            state.buttonPlayPause.innerHTML =
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 19H18V5H14V19ZM6 19H10V5H6V19Z" fill="white"/></svg>';
          }
        } else {
          videoElement.pause();
          if (state.buttonPlayPause) {
            state.buttonPlayPause.innerHTML =
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="white"/></svg>';
          }
        }
        break;
      case "ArrowLeft": // Left arrow - seek backward
        e.preventDefault(); // Prevent default browser scrolling
        e.stopPropagation(); // Stop event from being handled elsewhere
        sendSeekKeyToNetflix("left"); // Send the key to Netflix player
        break;

      case "ArrowRight": // Right arrow - seek forward
        e.preventDefault(); // Prevent default browser scrolling
        e.stopPropagation(); // Stop event from being handled elsewhere
        sendSeekKeyToNetflix("right"); // Send the key to Netflix player
        break;
      case "ArrowUp": // Up arrow - volume up
        e.preventDefault();
        videoElement.volume = Math.min(1, videoElement.volume + 0.1);
        if (state.volumeSlider) {
          state.volumeSlider.value = videoElement.volume * 100;
        }
        showMessage(`Volume: ${Math.round(videoElement.volume * 100)}%`);
        break;

      case "ArrowDown": // Down arrow - volume down
        e.preventDefault();
        videoElement.volume = Math.max(0, videoElement.volume - 0.1);
        if (state.volumeSlider) {
          state.volumeSlider.value = videoElement.volume * 100;
        }
        showMessage(`Volume: ${Math.round(videoElement.volume * 100)}%`);
        break;

      case "m": // M - toggle mute
      case "M":
        e.preventDefault();
        videoElement.muted = !videoElement.muted;
        const volumeIcon = document.getElementById("netflix-volume-icon");
        if (volumeIcon) {
          volumeIcon.innerHTML = videoElement.muted
            ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4L9.91 6.09 12 8.18M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.26c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.32 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9" fill="white"/></svg>'
            : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.84-5 6.7v2.07c4-.91 7-4.49 7-8.77 0-4.28-3-7.86-7-8.77M16.5 12c0-1.77-1-3.29-2.5-4.03V16c1.5-.71 2.5-2.24 2.5-4M3 9v6h4l5 5V4L7 9H3z" fill="white"/></svg>';
        }
        showMessage(videoElement.muted ? "Muted" : "Unmuted");
        break;

      case "f":
      case "F":
        e.preventDefault();
        e.stopPropagation();
        toggleFullScreen();
        showMessage(
          document.fullscreenElement ? "Fullscreen Mode" : "Exit Fullscreen"
        );
        break;

      case "c": // C - toggle subtitles
      case "C":
        e.preventDefault();
        state.subtitleEnabled = !state.subtitleEnabled;
        showMessage(state.subtitleEnabled ? "Subtitles On" : "Subtitles Off");

        // Update settings panel if open
        if (state.subtitleSettingsPanel) {
          state.subtitleSettingsPanel.querySelector(
            "#subtitle-toggle-checkbox"
          ).checked = state.subtitleEnabled;
        }
        break;

      case "b": // B - toggle bilingual subtitles
      case "B":
        e.preventDefault();
        e.stopPropagation();
        state.bilingualEnabled = !state.bilingualEnabled;

        if (state.bilingualEnabled) {
          // Make sure subtitles are enabled first
          if (!state.subtitleEnabled) {
            state.subtitleEnabled = true;
            // Update settings panel if open
            if (state.subtitleSettingsPanel) {
              state.subtitleSettingsPanel.querySelector(
                "#subtitle-toggle-checkbox"
              ).checked = true;
            }
          }
        }
        // Update settings panel if open
        if (state.subtitleSettingsPanel) {
          state.subtitleSettingsPanel.querySelector(
            "#bilingual-toggle-checkbox"
          ).checked = state.bilingualEnabled;
        }
        break;

      // Add other shortcuts as needed
    }
  };

  // Add the keyboard listener - DO NOT USE CAPTURE MODE for Arrow keys to work properly
  document.addEventListener("keydown", state.keyboardListener);

  // Set up key handler specifically for NetFlix's video element to monitor seeking progress
  const netflixSeekMonitor = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Update our progress bar to match Netflix's seeking
      requestAnimationFrame(updateProgression);
    }
  };

  // Add this directly to the video element
  const videoElement = document.querySelector("video");
  if (videoElement) {
    videoElement.addEventListener("keydown", netflixSeekMonitor);

    // Also monitor seeking events
    videoElement.addEventListener("seeking", () => {
      requestAnimationFrame(updateProgression);
    });

    // And timeupdate events
    videoElement.addEventListener("timeupdate", () => {
      requestAnimationFrame(updateProgression);
    });
  }
}

/**
 * Find the Netflix player element and send keyboard events to it
 * @param {string} direction - 'left' or 'right'
 */
function sendSeekKeyToNetflix(direction) {
  // Find the Netflix player - using the class and data attribute you identified
  const netflixPlayer = document.querySelector('div[data-uia="player"]');

  if (!netflixPlayer) {
    console.error("Netflix player element not found");
    return;
  }

  // Store current active element to restore focus later
  const previouslyFocused = document.activeElement;

  // Focus the Netflix player element
  netflixPlayer.focus();

  // Short delay to ensure focus is established
  setTimeout(() => {
    // Create a keyboard event
    const keyEvent = new KeyboardEvent("keydown", {
      key: direction === "left" ? "ArrowLeft" : "ArrowRight",
      code: direction === "left" ? "ArrowLeft" : "ArrowRight",
      keyCode: direction === "left" ? 37 : 39,
      which: direction === "left" ? 37 : 39,
      bubbles: true,
      cancelable: true,
      view: window,
    });

    // Dispatch the event to the Netflix player
    netflixPlayer.dispatchEvent(keyEvent);

    // Show a message to indicate the action
    showMessage(direction === "left" ? "Rewind" : "Fast Forward");

    // Restore previous focus after a short delay
    setTimeout(() => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    }, 100);
  }, 50);
}

/**
 * Add video overlay with additional properties to help with focus management
 */
function createVideoOverlay() {
  // Create video overlay that allows clicks to pass through to Netflix controls
  state.videoOverlay = document.createElement("div");
  state.videoOverlay.id = "netflix-video-overlay";
  state.videoOverlay.style.pointerEvents = "none"; // Allow clicks to pass through to Netflix's controls

  // Make overlay focusable but visually unchanged
  state.videoOverlay.tabIndex = -1; // Make focusable without being in tab order
  state.videoOverlay.style.outline = "none"; // Remove focus outline

  // Ensure our overlay can intercept keyboard events
  state.videoOverlay.addEventListener("keydown", (e) => {
    // Pass the event to our global keyboard handler
    if (state.keyboardListener) {
      state.keyboardListener(e);
    }
  });

  document.body.appendChild(state.videoOverlay);
}

function createVideoAreaOverlay() {
  const videoAreaOverlay = document.createElement("div");
  videoAreaOverlay.id = "netflix-video-area-overlay";
  videoAreaOverlay.style.position = "fixed";
  videoAreaOverlay.style.top = "0";
  videoAreaOverlay.style.left = "0";
  videoAreaOverlay.style.width = "100%";
  videoAreaOverlay.style.height = "calc(100% - 140px)";
  videoAreaOverlay.style.zIndex = "9997";
  videoAreaOverlay.style.cursor = "pointer";
  videoAreaOverlay.style.backgroundColor = "transparent";

  // Make it focusable
  videoAreaOverlay.tabIndex = -1;
  videoAreaOverlay.style.outline = "none";

  // Handle play/pause toggle
  videoAreaOverlay.addEventListener("click", (e) => {
    // Prevent clicks on controller from triggering this
    if (
      !e.target.closest("#mon-controleur-netflix") &&
      !e.target.closest("#netflix-subtitle-settings")
    ) {
      if (state.videoElement.paused) {
        state.videoElement.play();
        if (state.buttonPlayPause) {
          state.buttonPlayPause.innerHTML =
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 19H18V5H14V19ZM6 19H10V5H6V19Z" fill="white"/></svg>';
        }
      } else {
        state.videoElement.pause();
        if (state.buttonPlayPause) {
          state.buttonPlayPause.innerHTML =
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="white"/></svg>';
        }
      }
    }
  });

  // Handle double-click for fullscreen
  videoAreaOverlay.addEventListener("dblclick", (e) => {
    // Prevent double-click on controller
    if (
      !e.target.closest("#mon-controleur-netflix") &&
      !e.target.closest("#netflix-subtitle-settings")
    ) {
      toggleFullScreen();
    }
  });

  document.body.appendChild(videoAreaOverlay);
  return videoAreaOverlay;
}

/**
 * Add the media controller to the page
 */
function addMediaController() {
  if (state.isControllerAdded) return;

  cleanController();

  state.videoElement = document.querySelector("video");
  if (!state.videoElement) return;

  createStylesIfNeeded();

  // Create enhanced video overlays for better focus management
  createVideoOverlay();
  const videoAreaOverlay = createVideoAreaOverlay();

  // Create controller element as before
  state.controllerElement = document.createElement("div");
  state.controllerElement.id = CONTROLLER_ID;

  // Make controller focusable too
  state.controllerElement.tabIndex = -1;
  state.controllerElement.style.outline = "none";

  // Create video overlay that allows clicks to pass through to Netflix controls
  state.videoOverlay = document.createElement("div");
  state.videoOverlay.id = "netflix-video-overlay";
  state.videoOverlay.style.pointerEvents = "none"; // Allow clicks to pass through to Netflix's controls

  // Create a separate overlay just for the video area (excluding controls)
  videoAreaOverlay.id = "netflix-video-area-overlay";
  videoAreaOverlay.style.position = "fixed";
  videoAreaOverlay.style.top = "0";
  videoAreaOverlay.style.left = "0";
  videoAreaOverlay.style.width = "100%";
  videoAreaOverlay.style.height = "calc(100% - 140px)"; // Exclude Netflix controls area
  videoAreaOverlay.style.zIndex = "9997";
  videoAreaOverlay.style.cursor = "pointer";
  videoAreaOverlay.style.backgroundColor = "transparent";

  state.controllerElement = document.createElement("div");
  state.controllerElement.id = CONTROLLER_ID;

  // Create container divs for better layout
  const controlsLeft = document.createElement("div");
  controlsLeft.className = "controls-left";

  const controlsCenter = document.createElement("div");
  controlsCenter.className = "controls-center";

  const controlsRight = document.createElement("div");
  controlsRight.className = "controls-right";

  state.buttonPlayPause = document.createElement("button");
  state.buttonPlayPause.id = "netflix-play-pause";
  state.buttonPlayPause.innerHTML = state.videoElement.paused
    ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="white"/></svg>'
    : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 19H18V5H14V19ZM6 19H10V5H6V19Z" fill="white"/></svg>';

  state.buttonFullScreen = document.createElement("button");
  state.buttonFullScreen.id = "netflix-plein-ecran";
  state.buttonFullScreen.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" fill="white"/></svg>';

  // Jump to next espisode button
  const nextEpisodeButton = document.createElement("button");
  nextEpisodeButton.id = "netflix-next-episode";
  nextEpisodeButton.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" role="img" viewBox="0 0 24 24" width="24" height="24" data-icon="NextEpisodeStandard" aria-hidden="true"><path fill="white" d="M22 3H20V21H22V3ZM4.28615 3.61729C3.28674 3.00228 2 3.7213 2 4.89478V19.1052C2 20.2787 3.28674 20.9977 4.28615 20.3827L15.8321 13.2775C16.7839 12.6918 16.7839 11.3082 15.8321 10.7225L4.28615 3.61729ZM4 18.2104V5.78956L14.092 12L4 18.2104Z" clip-rule="evenodd" fill-rule="evenodd"></path></svg>';

  // grey out the next episode button (default)
  nextEpisodeButton.disabled = true;
  nextEpisodeButton.style.opacity = "0.5";
  // enable button if next episode is available
  getNextEpisodeId().then((nextEpisodeId) => {
    if (nextEpisodeId) {
      nextEpisodeButton.disabled = false;
      nextEpisodeButton.style.opacity = "1"; // Enable button
    } else {
      nextEpisodeButton.disabled = true;
      nextEpisodeButton.style.opacity = "0.5"; // Greyed out
    }
  });

  // Subtitle toggle button
  const subtitleToggle = document.createElement("button");
  subtitleToggle.id = "netflix-subtitle-toggle";
  subtitleToggle.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20,4H4C2.9,4 2,4.9 2,6V18C2,19.1 2.9,20 4,20H20C21.1,20 22,19.1 22,18V6C22,4.9 21.1,4 20,4M20,18H4V6H20V18M6,10H8V12H6V10M6,14H14V16H6V14M16,14H18V16H16V14M10,10H18V12H10Z" fill="white"/></svg>';

  // remove toggle button , to use if you have a bug
  const removeToggle = document.createElement("button");
  removeToggle.id = "netflix-remove-toggle";
  removeToggle.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M12 7.25C12.4142 7.25 12.75 7.58579 12.75 8V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V8C11.25 7.58579 11.5858 7.25 12 7.25Z" fill="#ffffff"></path> <path d="M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z" fill="#ffffff"></path> <path fill-rule="evenodd" clip-rule="evenodd" d="M8.2944 4.47643C9.36631 3.11493 10.5018 2.25 12 2.25C13.4981 2.25 14.6336 3.11493 15.7056 4.47643C16.7598 5.81544 17.8769 7.79622 19.3063 10.3305L19.7418 11.1027C20.9234 13.1976 21.8566 14.8523 22.3468 16.1804C22.8478 17.5376 22.9668 18.7699 22.209 19.8569C21.4736 20.9118 20.2466 21.3434 18.6991 21.5471C17.1576 21.75 15.0845 21.75 12.4248 21.75H11.5752C8.91552 21.75 6.84239 21.75 5.30082 21.5471C3.75331 21.3434 2.52637 20.9118 1.79099 19.8569C1.03318 18.7699 1.15218 17.5376 1.65314 16.1804C2.14334 14.8523 3.07658 13.1977 4.25818 11.1027L4.69361 10.3307C6.123 7.79629 7.24019 5.81547 8.2944 4.47643ZM9.47297 5.40432C8.49896 6.64148 7.43704 8.51988 5.96495 11.1299L5.60129 11.7747C4.37507 13.9488 3.50368 15.4986 3.06034 16.6998C2.6227 17.8855 2.68338 18.5141 3.02148 18.9991C3.38202 19.5163 4.05873 19.8706 5.49659 20.0599C6.92858 20.2484 8.9026 20.25 11.6363 20.25H12.3636C15.0974 20.25 17.0714 20.2484 18.5034 20.0599C19.9412 19.8706 20.6179 19.5163 20.9785 18.9991C21.3166 18.5141 21.3773 17.8855 20.9396 16.6998C20.4963 15.4986 19.6249 13.9488 18.3987 11.7747L18.035 11.1299C16.5629 8.51987 15.501 6.64148 14.527 5.40431C13.562 4.17865 12.8126 3.75 12 3.75C11.1874 3.75 10.4379 4.17865 9.47297 5.40432Z" fill="#ffffff"></path> </g></svg>';

  const barreContainer = document.createElement("div");
  barreContainer.id = "netflix-barre-container";

  state.progressionBar = document.createElement("div");
  state.progressionBar.id = "netflix-barre-progression";

  state.screenTime = document.createElement("div");
  state.screenTime.id = "netflix-temps";

  // Volume control
  const volumeContainer = document.createElement("div");
  volumeContainer.id = "netflix-volume-container";

  const volumeIcon = document.createElement("div");
  volumeIcon.id = "netflix-volume-icon";
  volumeIcon.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.84-5 6.7v2.07c4-.91 7-4.49 7-8.77 0-4.28-3-7.86-7-8.77M16.5 12c0-1.77-1-3.29-2.5-4.03V16c1.5-.71 2.5-2.24 2.5-4M3 9v6h4l5 5V4L7 9H3z" fill="white"/></svg>';

  const volumeSliderContainer = document.createElement("div");
  volumeSliderContainer.id = "netflix-volume-slider-container";

  state.volumeSlider = document.createElement("input");
  state.volumeSlider.type = "range";
  state.volumeSlider.id = "netflix-volume-slider";
  state.volumeSlider.min = "0";
  state.volumeSlider.max = "100";
  state.volumeSlider.value = state.videoElement.volume * 100;

  const handleControlsClick = (e) => {
    if (
      e.target === state.buttonPlayPause ||
      e.target.closest("#netflix-play-pause")
    ) {
      if (state.videoElement.paused) {
        state.videoElement.play();
        doYourJob();
        state.buttonPlayPause.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 19H18V5H14V19ZM6 19H10V5H6V19Z" fill="white"/></svg>';
      } else {
        state.videoElement.pause();
        state.buttonPlayPause.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="white"/></svg>';
      }
    } else if (
      e.target === state.buttonFullScreen ||
      e.target.closest("#netflix-plein-ecran")
    ) {
      toggleFullScreen();
    } else if (
      e.target === volumeIcon ||
      e.target.closest("#netflix-volume-icon")
    ) {
      state.videoElement.muted = !state.videoElement.muted;
      volumeIcon.innerHTML = state.videoElement.muted
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4L9.91 6.09 12 8.18M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.26c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.32 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9" fill="white"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.84-5 6.7v2.07c4-.91 7-4.49 7-8.77 0-4.28-3-7.86-7-8.77M16.5 12c0-1.77-1-3.29-2.5-4.03V16c1.5-.71 2.5-2.24 2.5-4M3 9v6h4l5 5V4L7 9H3z" fill="white"/></svg>';
    } else if (
      e.target === nextEpisodeButton ||
      e.target.closest("#netflix-next-episode")
    ) {
      // Trigger next episode action
      jumpToNextEpisode();
    } else if (
      e.target === episodesButton ||
      e.target.closest("#netflix-episodes-button")
    ) {
      // Toggle episodes list
      const panel = document.getElementById("netflix-episodes-list");
      if (panel) {
        panel.remove();
        state.episodesListOpen = false;
      } else {
        showEpisodesList();
      }
    } else if (
      e.target === subtitleToggle ||
      e.target.closest("#netflix-subtitle-toggle")
    ) {
      // Toggle subtitle settings panel
      toggleSubtitleSettings();
    } else if (
      e.target === removeToggle ||
      e.target.closest("#netflix-remove-toggle")
    ) {
      doYourJob();
      showMessage("bypassed successfully");
    }
  };

  state.volumeSlider.addEventListener("input", (e) => {
    const volume = e.target.value / 100;
    state.videoElement.volume = volume;
    state.videoElement.muted = volume === 0;
    volumeIcon.innerHTML =
      volume === 0
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4L9.91 6.09 12 8.18M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.26c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.32 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9" fill="white"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.84-5 6.7v2.07c4-.91 7-4.49 7-8.77 0-4.28-3-7.86-7-8.77M16.5 12c0-1.77-1-3.29-2.5-4.03V16c1.5-.71 2.5-2.24 2.5-4M3 9v6h4l5 5V4L7 9H3z" fill="white"/></svg>';
  });

  state.controllerElement.addEventListener("click", handleControlsClick);

  document.addEventListener("fullscreenchange", () => {
    if (state.buttonFullScreen) {
      state.buttonFullScreen.innerHTML = document.fullscreenElement
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 3.41L16.41 9L18 10.59L23.59 5L22 3.41M2 5L7.59 10.59L9.18 9L3.59 3.41L2 5M18 13.41L16.41 15L22 20.59L23.59 19L18 13.41M9.18 15L7.59 13.41L2 19L3.59 20.59L9.18 15Z" fill="white"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.59 5.59L18 7L12 13L7.41 18.41L6 17L12 11L18 17L16.59 18.41Z" fill="white"/></svg>';
    }
  });

  state.videoElement.addEventListener("play", () => {
    if (state.buttonPlayPause)
      state.buttonPlayPause.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 19H18V5H14V19ZM6 19H10V5H6V19Z" fill="white"/></svg>';
    showController();
  });

  state.videoElement.addEventListener("pause", () => {
    if (state.buttonPlayPause)
      state.buttonPlayPause.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="white"/></svg>';
    if (state.controllerElement) {
      state.controllerElement.classList.remove("hidden");
      state.isControllerVisible = true;
    }
  });

  setupKeyboardShortcuts();

  setTimeout(() => {
    if (videoAreaOverlay) {
      videoAreaOverlay.focus();
    }
  }, 500);

  // Prevent Netflix from stealing focus
  document.addEventListener("focusin", (e) => {
    if (
      state.isControllerAdded &&
      !e.target.closest("#mon-controleur-netflix") &&
      !e.target.closest("#netflix-subtitle-settings") &&
      e.target.tagName !== "INPUT" &&
      e.target.tagName !== "TEXTAREA" &&
      state.videoOverlay
    ) {
      // Wait to avoid focus fighting and only if not user-initiated
      if (!state.userInitiatedFocus) {
        setTimeout(() => {
          state.videoOverlay.focus();
        }, 10);
      }
    }
  });

  // Track user-initiated focus
  document.addEventListener("mousedown", () => {
    state.userInitiatedFocus = true;
    setTimeout(() => {
      state.userInitiatedFocus = false;
    }, 100);
  });

  // Auto-hide controller after inactivity
  state.videoElement.addEventListener("mousemove", () => {
    showController();
  });

  document.addEventListener("mousemove", () => {
    showController();
  });

  // Add click event to overlay for play/pause toggle
  state.videoOverlay.addEventListener("click", (e) => {
    // Prevent clicks on controller from triggering this
    if (
      !e.target.closest("#mon-controleur-netflix") &&
      !e.target.closest("#netflix-subtitle-settings")
    ) {
      if (state.videoElement.paused) {
        state.videoElement.play();
        state.buttonPlayPause.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 19H18V5H14V19ZM6 19H10V5H6V19Z" fill="white"/></svg>';
      } else {
        state.videoElement.pause();
        state.buttonPlayPause.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="white"/></svg>';
      }
    }
  });

  // Set up keyboard shortcuts

  volumeSliderContainer.appendChild(state.volumeSlider);
  volumeContainer.appendChild(volumeIcon);
  volumeContainer.appendChild(volumeSliderContainer);

  barreContainer.appendChild(state.progressionBar);

  // Create a container for the progress bar to ensure vertical alignment
  const progressContainer = document.createElement("div");
  progressContainer.style.display = "flex";
  progressContainer.style.alignItems = "center"; // Center items vertically
  progressContainer.style.flex = "1";
  progressContainer.appendChild(barreContainer);

  // Organize controls
  controlsLeft.appendChild(state.buttonPlayPause);
  controlsLeft.appendChild(volumeContainer);
  controlsLeft.appendChild(state.screenTime);

  const episodesButton = document.createElement("button");
  episodesButton.id = "netflix-episodes-button";
  episodesButton.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6H20V8H4V6M4 11H20V13H4V11M4 16H20V18H4V16Z" fill="white"/></svg>';

  controlsRight.appendChild(nextEpisodeButton);
  controlsRight.appendChild(episodesButton);
  controlsRight.appendChild(removeToggle);
  controlsRight.appendChild(subtitleToggle);
  controlsRight.appendChild(state.buttonFullScreen);

  state.controllerElement.appendChild(controlsLeft);
  state.controllerElement.appendChild(progressContainer);
  state.controllerElement.appendChild(controlsRight);

  // Add the overlay first, then the controller (so controller is on top)
  document.body.appendChild(state.videoOverlay);
  document.body.appendChild(state.controllerElement);
  state.isControllerAdded = true;

  updateProgression();

  const rafCallback = () => {
    updateProgression();
    if (state.controllerElement) {
      state.progressionIntervalId = requestAnimationFrame(rafCallback);
    }
  };
  state.progressionIntervalId = requestAnimationFrame(rafCallback);

  // Set up Event listener to allow seeking using progress bar
  barreContainer.addEventListener("click", (e) => {
    const rect = barreContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100; // allows us to determine where user wants to seek to

    const totalVideoTime = Math.floor(state.videoElement.duration); // seconds
    const seekTime = Math.floor((percent / 100) * totalVideoTime * 1000); // ms

    // Send to injected script for custom seeking
    window.dispatchEvent(
      new CustomEvent("netflixSeekTo", { detail: seekTime })
    );
  });

  // Initial auto-hide if video is playing
  if (!state.videoElement.paused) {
    showController();
  }

  // Create subtitle settings panel
  state.subtitleSettingsPanel = createSubtitleSettings();

  // If subtitles were previously enabled, re-enable them
  // Create and add back button
  createBackButton();
}

/**
 * Remove elements by class name
 * @param {string[]} classesNames - Array of class names to remove
 */
function removeElementsByClasses(classesNames) {
  classesNames.forEach((className) => {
    const elementsToRemove = document.querySelectorAll(
      `[class*="${className}"]`
    );
    if (elementsToRemove.length > 0) {
      elementsToRemove.forEach((el) => el.remove());
    }
  });
}

/**
 * Main function to initialize or cleanup the controller
 */
function doYourJob() {
  //get audio trackliste
  window.dispatchEvent(new CustomEvent("GetAudioTracksList"));
  //get substitle trackliste
  window.dispatchEvent(new CustomEvent("GetSubtitleTracksList"));
  if (isOnNetflixWatch()) {
    removeElementsByClasses(CLASSES_TO_REMOVE);

    // Use debounce technique to prevent multiple calls
    if (state.controllerTimerId) {
      clearTimeout(state.controllerTimerId);
    }

    state.controllerTimerId = setTimeout(() => {
      addMediaController();
      state.controllerTimerId = null;
    }, CONTROLLER_INIT_DELAY);
  } else {
    removeElementsByClasses(CLASSES_TO_REMOVE);
    cleanController();
  }
}

// Set up MutationObserver to detect DOM changes
const observerOptions = {
  childList: true,
  subtree: true,
};

const observer = new MutationObserver((mutations) => {
  if (state.mutationTimeout) clearTimeout(state.mutationTimeout);

  state.mutationTimeout = setTimeout(() => {
    const hasRelevantChanges = mutations.some((mutation) => {
      return Array.from(mutation.addedNodes).some((node) => {
        if (node.nodeName === "VIDEO") return true;

        // Check if relevant to our controller
        if (node.nodeType === Node.ELEMENT_NODE) {
          // More robust class checking
          const nodeClassName = node.className || "";
          return (
            node.querySelector("video") ||
            CLASSES_TO_REMOVE.some(
              (c) =>
                typeof nodeClassName === "string" && nodeClassName.includes(c)
            )
          );
        }
        return false;
      });
    });

    if (hasRelevantChanges || !state.isControllerAdded) {
      doYourJob();
    }
  }, 100); // Debounce time
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupKeyboardShortcuts();

    observer.observe(document.body, observerOptions);
    doYourJob();
  });
} else {
  setupKeyboardShortcuts();

  observer.observe(document.body, observerOptions);
  doYourJob();
}

/**
 * Create and add back button to exit Netflix video player
 */
function createBackButton() {
  if (state.backButton) return; // Don't create if it already exists

  state.backButton = document.createElement("button");
  state.backButton.id = "netflix-back-button";
  state.backButton.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="white"/></svg>';

  // Style the back button
  state.backButton.style.position = "fixed";
  state.backButton.style.top = "20px";
  state.backButton.style.left = "20px";
  state.backButton.style.zIndex = "10000";
  state.backButton.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
  state.backButton.style.border = "none";
  state.backButton.style.borderRadius = "50%";
  state.backButton.style.width = "40px";
  state.backButton.style.height = "40px";
  state.backButton.style.cursor = "pointer";
  state.backButton.style.display = "flex";
  state.backButton.style.alignItems = "center";
  state.backButton.style.justifyContent = "center";
  state.backButton.style.transition = "all 0.2s ease, opacity 0.3s ease";
  state.backButton.style.opacity = "0";

  // Add hover effect
  state.backButton.addEventListener("mouseover", () => {
    state.backButton.style.backgroundColor = "rgba(229, 9, 20, 0.8)";
    state.backButton.style.transform = "scale(1.1)";
  });

  state.backButton.addEventListener("mouseout", () => {
    state.backButton.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
    state.backButton.style.transform = "scale(1)";
  });

  // Add click event to exit Netflix player
  state.backButton.addEventListener("click", () => {
    // Try multiple approaches to exit the Netflix video player

    // Approach 1: Look for Netflix's own back button and click it
    const netflixBackButton =
      document.querySelector('button[data-uia="player-back-to-browse"]') ||
      document.querySelector(".button-nfplayerBack") ||
      document.querySelector("button.nf-player-container button") ||
      document.querySelector('button[aria-label="Back to Browse"]');

    if (netflixBackButton) {
      netflixBackButton.click();
      return;
    }

    // Approach 2: Simulate Escape key press (commonly exits fullscreen video players)
    const escKeyEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });

    document.body.dispatchEvent(escKeyEvent);

    // Approach 3: Look for back button within specific Netflix player containers
    const playerContainer =
      document.querySelector(".nf-player-container") ||
      document.querySelector(".watch-video--player-view");

    if (playerContainer) {
      const backBtn = playerContainer.querySelector("button");
      if (backBtn) {
        backBtn.click();
        return;
      }
    }

    // Approach 4: As a fallback, try to return to the browse page
    const currentUrl = window.location.href;
    if (currentUrl.includes("netflix.com/watch/")) {
      window.location.href = "https://www.netflix.com/browse";
    }
  });

  document.body.appendChild(state.backButton);

  // Connect to controller visibility changes
  const originalShowController = showController;
  showController = function () {
    originalShowController();
  };

  // Handle controller hide timer completion
  const originalControllerHideTimer = state.controllerHideTimer;
  if (originalControllerHideTimer) {
    clearTimeout(originalControllerHideTimer);
    state.controllerHideTimer = setTimeout(() => {
      if (
        state.controllerElement &&
        !state.videoElement.paused &&
        !state.subtitleSettingsOpen
      ) {
        state.controllerElement.classList.add("hidden");
        state.isControllerVisible = false;
        state.backButton.style.opacity = "0";
      }
    }, CONTROLLER_HIDE_DELAY);
  }
}

function getIdFromUrl() {
  const url = window.location.href;
  const parts = url.split("/");
  const watchIndex = parts.indexOf("watch");
  if (watchIndex !== -1 && watchIndex + 1 < parts.length) {
    return parts[watchIndex + 1].split("?")[0];
  }
  return null;
}

function getNextEpisodeId() {
  const curEpisodeId = getIdFromUrl(); // Get current episode ID from the URL
  if (!curEpisodeId) {
    console.log("No current episode ID found in URL");
    return null;
  }

  // Fetch the metadata for the current episode
  return fetch(
    `https://www.netflix.com/nq/website/memberapi/release/metadata?movieid=${curEpisodeId}`,
    {
      credentials: "include", // Important: includes your session cookies
    }
  )
    .then((response) => response.json())
    .then((response) => {
      const episodes = response.video.seasons.reduce((acc, season) => {
        if (season.episodes) {
          acc.push(...season.episodes);
        }
        return acc;
      }, []);

      console.log("Current Episode ID: ", curEpisodeId);

      // Find the index of the current episode
      const curEpisodeIndex = episodes.findIndex(
        (episode) => episode.id.toString() === curEpisodeId
      );
      if (curEpisodeIndex === -1) {
        console.log("Current episode not found");
        return null;
      }

      // Get the next episode
      const nextEpisode = episodes[curEpisodeIndex + 1] || null;
      if (nextEpisode) {
        return nextEpisode.id;
      } else {
        console.log("No next episode found");
        return null;
      }
    })
    .catch((error) => {
      console.error("Error fetching metadata:", error);
      return null;
    });
}

function jumpToNextEpisode() {
  getNextEpisodeId()
    .then((nextEpisodeId) => {
      if (nextEpisodeId) {
        const nextEpisodeUrl = `https://www.netflix.com/watch/${nextEpisodeId}`;
        window.location.href = nextEpisodeUrl; // Redirect to the next episode
      } else {
        console.log("No next episode found or error fetching data.");
      }
    })
    .catch((error) => {
      console.error("Error jumping to next episode:", error);
    });
  console.log("Next episode triggered....");
}
