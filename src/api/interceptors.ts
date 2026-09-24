import axios, { AxiosError } from 'axios';
import router from '@/router';

const initInterceptors = () => {
    axios.interceptors.response.use(
        async (response) => {
            return response;
        },
        async (error: AxiosError) => {
            if (error.response?.status === 401 && router.currentRoute.value.path !== '/login') {
                await router.push('/login');
            }
            return Promise.reject(error);
        });
}

export { initInterceptors };
