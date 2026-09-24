<script setup lang="ts">
import { ref } from 'vue';
import Cookies from 'js-cookie';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t: $t } = useI18n();

const password = ref('');
const loginError = ref('');
const isSubmitting = ref(false);

const onSubmit = async () => {
    if (!password.value) {
        loginError.value = $t('login.empty_password');
        return;
    }

    isSubmitting.value = true;
    loginError.value = '';
    Cookies.set('PASSWORD', password.value, {
        path: '/',
        sameSite: 'lax',
        secure: window.location.protocol === 'https:',
        expires: 30,
    });

    try {
        const response = await fetch('/api/auth', { cache: 'no-store' });
        if (response.status === 401) {
            Cookies.remove('PASSWORD', { path: '/' });
            loginError.value = $t('login.invalid_password');
            return;
        }
        if (!response.ok) {
            throw new Error('Authentication service unavailable');
        }

        const backPath = window.history.state.back;
        if (typeof backPath === 'string' && backPath !== '/login') {
            await router.replace(backPath);
        } else {
            await router.replace('/');
        }
    } catch {
        Cookies.remove('PASSWORD', { path: '/' });
        loginError.value = $t('login.connection_error');
    } finally {
        isSubmitting.value = false;
    }
};
</script>

<template>
    <div class="login-page">
        <form class="login-card" @submit.prevent="onSubmit">
            <router-link to="/" class="login-brand">FileWorker</router-link>
            <h1>{{ $t("login.login_title") }}</h1>
            <p class="login-description">{{ $t("index.description") }}</p>
            <input
                v-model="password"
                class="password-input"
                type="password"
                autocomplete="current-password"
                :placeholder="$t('login.password_placeholder')"
                :aria-label="$t('login.password_placeholder')"
                @input="loginError = ''"
            />
            <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>
            <button class="login-button" type="submit" :disabled="isSubmitting">
                {{ isSubmitting ? $t('common.loading') : $t('login.login_button') }}
            </button>
        </form>
    </div>
</template>

<style scoped>
.login-page {
    display: grid;
    min-height: calc(100vh - 56px);
    place-items: center;
}

.login-card {
    display: flex;
    width: min(100%, 390px);
    flex-direction: column;
    padding: 30px;
    background: #fff;
    border: 1px solid #e4e8ee;
    border-radius: 16px;
    box-shadow: 0 12px 36px #34405412;
}

.login-brand {
    margin-bottom: 24px;
    color: #175cd3;
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
}

h1 {
    margin: 0;
    color: #172033;
    font-size: 23px;
    letter-spacing: -0.03em;
}

.login-description {
    margin: 9px 0 22px;
    color: #667085;
    font-size: 14px;
    line-height: 1.6;
}

.password-input {
    width: 100%;
    padding: 11px 12px;
    color: #172033;
    border: 1px solid #d0d5dd;
    border-radius: 9px;
    outline: none;
}

.password-input:focus {
    border-color: #84adff;
    box-shadow: 0 0 0 3px #2e90fa1f;
}

.login-error {
    margin: 10px 0 0;
    color: #b42318;
    font-size: 13px;
}

.login-button {
    margin-top: 16px;
    padding: 11px 14px;
    color: #fff;
    font-weight: 650;
    background: #175cd3;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
}

.login-button:hover:not(:disabled) {
    background: #1849a9;
}

.login-button:disabled {
    cursor: wait;
    opacity: 0.65;
}
</style>
