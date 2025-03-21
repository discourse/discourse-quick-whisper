import { debounce } from "@ember/runloop";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { getAbsoluteURL } from "discourse/lib/get-url";
import { withPluginApi } from "discourse/lib/plugin-api";
import { cook } from "discourse/lib/text";

export default {
  name: "discourse-quick-whisper",

  initialize() {
    withPluginApi("0.8.7", (api) => {
      const currentUser = api.getCurrentUser();

      const canUseFeature = currentUser?.whisperer || currentUser?.can_assign;

      if (!canUseFeature) {
        return;
      }

      function fetchCurrentTopic() {
        const topicController = api.container.lookup("controller:topic");
        if (topicController) {
          const topic = topicController.get("model");
          if (topic) {
            return topic;
          }
        }
      }

      // Prior to any other work, if at the bottom of the topic
      // attempt to destroy any assign/unassign message related to currentUser
      // and remove previous quick whisper done by currentUser in the last 20 posts
      function cleanTopic(topic) {
        return cook(settings.message).then((cooked) => {
          if (topic.postStream && !topic.postStream.lastPostNotLoaded) {
            const posts = topic.postStream.posts.slice().reverse().slice(0, 20);

            posts.forEach((post) => {
              if (
                (post.action_code === "assigned" ||
                  post.action_code === "unassigned") &&
                post.action_code_who === currentUser.username
              ) {
                post.destroy(currentUser);
              } else if (
                cooked.string ===
                  post.cooked.replace(
                    getAbsoluteURL("").replace(/http(s)?:/g, ""),
                    ""
                  ) &&
                post.user_id === currentUser.id
              ) {
                post.destroy(currentUser);
              }
            });
          }
        });
      }

      function debouncedTrackTopic() {
        debounce(api, trackTopic, 5000, true);
      }

      function trackTopic() {
        const topic = fetchCurrentTopic();
        if (!topic) {
          return;
        }

        return cleanTopic(topic, currentUser).then(() => {
          if (currentUser.can_assign) {
            const taskActions = api.container.lookup("service:task-actions");
            const assignedUser = topic.get("assigned_to_user.username");

            if (assignedUser) {
              if (currentUser && assignedUser === currentUser.username) {
                return taskActions.unassign(topic.id);
              } else {
                return createWhisper(api.container, topic.id);
              }
            } else if (taskActions) {
              return taskActions
                .reassignUserToTopic(currentUser, topic)
                .catch(popupAjaxError);
            }
          } else {
            return createWhisper(api.container, topic.id);
          }
        });
      }

      function createWhisper(container, topicId) {
        const siteSettings = container.lookup("service:site-settings");
        if (!siteSettings.enable_whispers) {
          return;
        }

        return container
          .lookup("service:store")
          .createRecord("post", {
            raw: settings.message,
            topic_id: topicId,
            whisper: true,
            archetype: "regular",
            nested_post: true,
          })
          .save();
      }

      api.addKeyboardShortcut("ctrl+shift+l", debouncedTrackTopic, {
        global: true,
      });

      function buttonLabel() {
        const topic = fetchCurrentTopic(),
          assignedUser = topic.get("assigned_to_user.username"),
          siteSettings = api.container.lookup("service:site-settings");

        if (assignedUser && assignedUser === currentUser.username) {
          return "";
        }

        if (assignedUser && assignedUser !== currentUser.username) {
          return siteSettings.enable_whispers
            ? themePrefix("looking_into_this")
            : "";
        }

        return themePrefix("self_assign");
      }

      api.registerTopicFooterButton({
        id: "quick-whisper",
        icon: "bolt",
        label() {
          return buttonLabel();
        },
        title() {
          return buttonLabel();
        },
        action() {
          debouncedTrackTopic();
        },
        dropdown: true,
        classNames: ["quick-whisper"],
        displayed() {
          return this.site.mobileView && buttonLabel() !== "";
        },
      });
    });
  },
};
