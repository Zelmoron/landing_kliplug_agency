import type { ImageMetadata } from 'astro';
import videokarta from '../assets/posters/videokarta.jpg';
import kofe from '../assets/posters/kofe.jpg';
import shiny from '../assets/posters/shiny.jpg';

export interface Work {
  key: string;
  label: string;
  duration: string;
  video: string;
  alt: string;
  poster: ImageMetadata;
  price: string;
  oldPrice: string;
  sale: string;
  name: string;
  rate: string;
  votes: string;
}

export const works: Work[] = [
  {
    key: 'tech',
    label: 'Техника',
    duration: '16 с',
    video: '/videos/videokarta.mp4',
    alt: 'Ролик для карточки: видеокарта',
    poster: videokarta,
    price: '42 990 ₽',
    oldPrice: '54 990 ₽',
    sale: '−22%',
    name: 'Видеокарта, 8 ГБ, три вентилятора',
    rate: '4,8',
    votes: '312 оценок',
  },
  {
    key: 'food',
    label: 'Продукты',
    duration: '13 с',
    video: '/videos/kofe.mp4',
    alt: 'Ролик для карточки: турецкий кофе',
    poster: kofe,
    price: '1 290 ₽',
    oldPrice: '1 990 ₽',
    sale: '−35%',
    name: 'Кофе молотый для турки, 250 г',
    rate: '4,9',
    votes: '128 оценок',
  },
  {
    key: 'auto',
    label: 'Автотовары',
    duration: '10 с',
    video: '/videos/shiny.mp4',
    alt: 'Ролик для карточки: шины для квадроцикла',
    poster: shiny,
    price: '8 490 ₽',
    oldPrice: '10 900 ₽',
    sale: '−22%',
    name: 'Шины для квадроцикла, комплект 2 шт',
    rate: '4,7',
    votes: '86 оценок',
  },
];

export type WorkView = Omit<Work, 'poster'> & { poster: string };

export const initialWork = 'food';
